import { createReadStream, createWriteStream, constants } from "node:fs";
import { lstat, readdir, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const API = "https://firebasehosting.googleapis.com/v1beta1/";
const UPLOAD = "https://upload-firebasehosting.googleapis.com/upload/";
const ID = /^[a-zA-Z0-9_-]+$/;
const HASH = /^[a-f0-9]{64}$/;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @typedef {{method: string, url: string, json?: {files?: Record<string,string>, status?: string, sourceVersion?: string, finalize?: boolean, include?: {regexes: string[]}}, bodyFile?: string, retry?: boolean}} HostingRequest */
/** @typedef {{request: (request: HostingRequest) => Promise<any>}} HostingClient */

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function checkedPath(value) {
  requireCondition(typeof value === "string" && value.startsWith("/") &&
    !/[\\%?#\u0000-\u001f\u007f]/.test(value) &&
    value.split("/").slice(1).every((part) => part && part !== "." && part !== ".."),
  "Invalid Hosting file path");
  return value;
}

function versionName(value, site) {
  const match = typeof value === "string" && value.match(/^(?:projects\/[a-zA-Z0-9_-]+\/)?sites\/([a-zA-Z0-9_-]+)\/versions\/([a-zA-Z0-9_-]+)$/);
  requireCondition(match && match[1] === site, "Invalid or foreign Hosting version identity");
  return `sites/${site}/versions/${match[2]}`;
}

async function boundedJson(response) {
  const chunks = [];
  let size = 0;
  if (response.body) for await (const chunk of response.body) {
    size += chunk.length;
    requireCondition(size <= 4 * 1024 * 1024, "Hosting API response exceeds size limit");
    chunks.push(Buffer.from(chunk));
  }
  return size ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

/** Official REST transport. Auth headers are refreshed per request; never redirected or logged.
 * Injection is for tests. Do not retry clone/release: their response may be lost after success.
 * @param {{auth?: {getRequestHeaders: (url: string) => Promise<HeadersInit>}, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>}} options
 * @returns {Promise<HostingClient>}
 */
export async function createHostingClient({ auth, fetchImpl = fetch, sleep = pause } = {}) {
  if (!auth) {
    const { GoogleAuth } = await import("google-auth-library");
    // The Hosting operations.get discovery schema requires firebase or cloud-platform,
    // unlike individual version methods which also document firebase.hosting.
    auth = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  }
  return {
    async request({ method, url, json, bodyFile, retry = true }) {
      const parsed = new URL(url);
      requireCondition(parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port &&
        !parsed.hash && (url.startsWith(API) || url.startsWith(UPLOAD)), "Untrusted Hosting API URL");
      const attempts = retry ? 3 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        let stream;
        let transient = false;
        try {
          const headers = new Headers(await auth.getRequestHeaders(url));
          if (bodyFile) {
            headers.set("content-type", "application/octet-stream");
            headers.set("content-length", String((await stat(bodyFile)).size));
            stream = createReadStream(bodyFile, { flags: constants.O_RDONLY | constants.O_NOFOLLOW });
          } else if (json !== undefined) headers.set("content-type", "application/json");
          let response;
          try {
            response = await fetchImpl(url, { method, headers, redirect: "error",
              signal: AbortSignal.timeout(120_000),
              ...(stream ? { body: stream, duplex: "half" } : json !== undefined ? { body: JSON.stringify(json) } : {}),
            });
          } catch {
            transient = true;
            throw new Error("Hosting API transport failed");
          }
          if (!response.ok) {
            transient = response.status === 429 || response.status >= 500;
            await response.body?.cancel();
            throw new Error(`Hosting API request failed (${response.status})`);
          }
          // Upload success has no response schema. Do not attempt JSON parsing.
          if (bodyFile) { await response.body?.cancel(); return {}; }
          return await boundedJson(response);
        } catch (error) {
          if (!transient || attempt + 1 === attempts) throw error;
        } finally { stream?.destroy(); }
        await sleep(1000 * 2 ** attempt);
      }
      throw new Error("Hosting request did not complete");
    },
  };
}

async function pool(values, count, action) {
  let index = 0;
  let failed;
  const workers = Array.from({ length: Math.min(count, values.length) }, async () => {
    while (!failed && index < values.length) {
      const current = index++;
      try { await action(values[current], current); }
      catch (error) { failed ||= error; }
    }
  });
  await Promise.all(workers); // Finish in-flight streams before cleaning staging files.
  if (failed) throw failed;
}

async function uiFiles(root) {
  const output = path.join(root, "out");
  requireCondition((await lstat(output)).isDirectory(), "out must be a real directory");
  const files = [];
  async function walk(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || (!relative && entry.name === "firebase.json")) continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const file = path.join(directory, entry.name);
      const info = await lstat(file);
      requireCondition(!info.isSymbolicLink(), "Symlinks cannot be deployed");
      checkedPath(`/${name}`);
      if (name === "omics") { requireCondition(info.isDirectory(), "omics must be a directory"); continue; }
      if (info.isDirectory()) await walk(file, name);
      else {
        requireCondition(info.isFile() && info.size < 2_000_000_000, "Hosting requires regular files below 2 GB");
        files.push({ path: `/${name}`, source: file });
      }
    }
  }
  await walk(output);
  requireCondition(files.some((file) => file.path === "/index.html") &&
    files.some((file) => file.path === "/deployment.json"), "Missing homepage or deployment receipt");
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function activeFiles(client, version) {
  const files = new Map();
  const tokens = new Set();
  let token = "";
  for (let pages = 0; pages < 10_000; pages++) {
    const query = new URLSearchParams({ status: "ACTIVE", pageSize: "1000", ...(token ? { pageToken: token } : {}) });
    const result = await client.request({ method: "GET", url: `${API}${version}/files?${query}` });
    requireCondition(Array.isArray(result.files || []) && (result.files || []).length <= 1000, "Invalid Hosting file listing");
    for (const file of result.files || []) {
      const name = checkedPath(file.path);
      requireCondition(HASH.test(file.hash) && file.status === "ACTIVE" && !files.has(name), "Invalid or duplicate Hosting file entry");
      files.set(name, file.hash);
    }
    if (!result.nextPageToken) return files;
    requireCondition(typeof result.nextPageToken === "string" && result.nextPageToken.length <= 16_384 &&
      !tokens.has(result.nextPageToken), "Invalid Hosting pagination token");
    token = result.nextPageToken;
    tokens.add(token);
  }
  throw new Error("Hosting file pagination limit exceeded");
}

function equalFiles(expected, actual) {
  requireCondition(expected.size === actual.size && [...expected].every(([name, hash]) => actual.get(name) === hash),
    "Hosting file preservation/composition mismatch");
}

/** Refuse a full CLI publication which would remove previously published downloads.
 * Generated full exports separately validate archive checksums. This read-only guard
 * checks remote inventory against local presence, without assuming identical gzip settings.
 * @param {{previousVersion: string, site?: string, root?: string, client?: HostingClient}} options
 * @returns {Promise<number>} Number of retained historical/source files checked.
 */
export async function assertHistoricalDownloadsPresent({ previousVersion, site = "rewire-it", root = process.cwd(), client }) {
  requireCondition(typeof site === "string" && ID.test(site) && typeof previousVersion === "string" && ID.test(previousVersion),
    "Invalid Hosting site or previous version");
  const output = path.join(path.resolve(root), "out");
  requireCondition((await lstat(output)).isDirectory(), "out must be a real directory");
  client ||= await createHostingClient();
  const files = await activeFiles(client, `sites/${site}/versions/${previousVersion}`);
  const historical = [...files.keys()].filter((name) => /^\/omics\/(?:releases|sources)\//.test(name));
  const checkedDirectories = new Set([output]);
  await pool(historical, 6, async (name) => {
    let current = output;
    const parts = name.slice(1).split("/");
    try {
      for (let index = 0; index < parts.length; index++) {
        current = path.join(current, parts[index]);
        const leaf = index === parts.length - 1;
        if (!leaf && checkedDirectories.has(current)) continue;
        const info = await lstat(current);
        requireCondition(!info.isSymbolicLink() && (leaf ? info.isFile() : info.isDirectory()), "Non-regular historical download path");
        if (!leaf) checkedDirectories.add(current);
      }
    } catch {
      throw new Error(`Full Hosting publication would remove or replace an unsafe historical download: ${name}. Archive the published release/source with verified checksums and restore it into out before retrying; do not bypass this guard.`);
    }
  });
  return historical.length;
}

/** Clone only immutable/current /omics assets, then add the freshly checked UI.
 * client.request({method,url,json?,bodyFile?,retry?}) returns parsed JSON.
 * beforeRelease and onReleaseAttempt are mandatory: the transaction owns live drift checks
 * and rollback. A failure before onReleaseAttempt must never roll back another publication.
 * Official API: https://firebase.google.com/docs/hosting/api-deploy
 * @param {{previousVersion: string, site?: string, root?: string, client?: HostingClient, beforeRelease: () => Promise<unknown>, onReleaseAttempt: () => unknown, concurrency?: number, pollAttempts?: number, pollIntervalMs?: number, sleep?: (ms: number) => Promise<void>}} options
 */
export async function deployWebHosting({ previousVersion, site = "rewire-it", root = process.cwd(), client,
  beforeRelease, onReleaseAttempt, concurrency = 6, pollAttempts = 120, pollIntervalMs = 1000, sleep = pause }) {
  requireCondition(ID.test(site) && typeof site === "string" && typeof previousVersion === "string" && ID.test(previousVersion),
    "Invalid Hosting site or previous version");
  requireCondition(typeof beforeRelease === "function" && typeof onReleaseAttempt === "function", "Release guard callbacks are required");
  requireCondition(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 16 &&
    Number.isInteger(pollAttempts) && pollAttempts >= 1 && pollAttempts <= 600 &&
    Number.isFinite(pollIntervalMs) && pollIntervalMs >= 0 && pollIntervalMs <= 10_000, "Invalid Hosting bounds");
  root = path.resolve(root);
  const files = await uiFiles(root);
  const workspace = path.join(root, "workbench");
  await mkdir(workspace, { recursive: true });
  requireCondition((await lstat(workspace)).isDirectory(), "workbench must be a real directory");
  const staging = await mkdtemp(path.join(workspace, "hosting-web-"));
  try {
    await pool(files, concurrency, async (file, index) => {
      file.compressed = path.join(staging, `${index}.gz`);
      const digest = createHash("sha256");
      const hashStream = new Transform({ transform(chunk, _encoding, callback) { digest.update(chunk); callback(null, chunk); } });
      await pipeline(createReadStream(file.source, { flags: constants.O_RDONLY | constants.O_NOFOLLOW }),
        createGzip({ level: 9 }), hashStream, createWriteStream(file.compressed, { flags: "wx", mode: 0o600 }));
      file.hash = digest.digest("hex");
    });
    client ||= await createHostingClient();
    const source = `sites/${site}/versions/${previousVersion}`;
    const original = await activeFiles(client, source);
    const retained = new Map([...original].filter(([name]) => name.startsWith("/omics/")));
    requireCondition(retained.has("/omics/manifest.json"), "Source version lacks /omics/manifest.json");
    for (const name of retained.keys()) {
      const release = name.match(/^\/omics\/releases\/([^/]+)\//)?.[1];
      if (release) requireCondition(retained.has(`/omics/releases/${release}/manifest.json`),
        "Source version lacks a historical release manifest");
    }
    let operation = await client.request({ method: "POST", url: `${API}sites/${site}/versions:clone`,
      json: { sourceVersion: source, finalize: false, include: { regexes: ["^/omics/.*$"] } }, retry: false });
    for (let attempts = 0; !operation.done && attempts < pollAttempts; attempts++) {
      requireCondition(typeof operation.name === "string" &&
        /^projects\/[a-zA-Z0-9_-]+\/operations\/[a-zA-Z0-9_-]+$/.test(operation.name), "Invalid clone operation identity");
      await sleep(pollIntervalMs);
      operation = await client.request({ method: "GET", url: `${API}${operation.name}` });
    }
    requireCondition(operation.done === true && !operation.error, "Hosting clone failed or timed out");
    const version = versionName(operation.response?.name, site);
    requireCondition(version !== source && operation.response.status === "CREATED",
    "Clone did not return a new same-site CREATED version");
    equalFiles(retained, await activeFiles(client, version));
    // Each populate operation adds mappings. No stale UI is cloned, and no /omics mapping is overwritten.
    const batches = [];
    for (let i = 0; i < files.length; i += 1000) batches.push(files.slice(i, i + 1000));
    // Sequential batches bound populate/upload concurrency together and deduplicate uploads.
    const uploaded = new Set();
    for (const batch of batches) {
      const hashes = new Map(batch.map((file) => [file.hash, file.compressed]));
      const result = await client.request({ method: "POST", url: `${API}${version}:populateFiles`,
        json: { files: Object.fromEntries(batch.map((file) => [file.path, file.hash])) } });
      requireCondition(result.uploadRequiredHashes === undefined || Array.isArray(result.uploadRequiredHashes), "Invalid requested upload hashes");
      const requested = [...new Set(result.uploadRequiredHashes || [])];
      requireCondition(requested.every((hash) => HASH.test(hash) && hashes.has(hash)), "Unknown requested upload hash");
      if (requested.length || result.uploadUrl !== undefined) requireCondition(result.uploadUrl === `${UPLOAD}${version}/files`, "Untrusted upload URL");
      await pool(requested.filter((hash) => !uploaded.has(hash)), concurrency, async (hash) => {
        await client.request({ method: "POST", url: `${result.uploadUrl}/${hash}`, bodyFile: hashes.get(hash) });
        uploaded.add(hash);
      });
    }
    const expected = new Map([...retained, ...files.map((file) => [file.path, file.hash])]);
    equalFiles(expected, await activeFiles(client, version));
    const finalized = await client.request({ method: "PATCH", url: `${API}${version}?updateMask=status`, json: { status: "FINALIZED" } });
    requireCondition(versionName(finalized.name, site) === version && finalized.status === "FINALIZED", "Hosting finalization failed");
    await beforeRelease();
    await onReleaseAttempt();
    const release = await client.request({ method: "POST", url: `${API}sites/${site}/releases?${new URLSearchParams({ versionName: version })}`, retry: false });
    requireCondition(versionName(release.version?.name, site) === version, "Hosting release response mismatch");
    return version;
  } finally { await rm(staging, { recursive: true, force: true }); }
}
