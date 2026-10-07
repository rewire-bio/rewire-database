import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { assertHistoricalDownloadsPresent, createHostingClient, deployWebHosting } from "../scripts/hosting-web-deploy.mjs";

import { createDeploymentMetrics } from "../scripts/deployment-metrics.mjs";

const roots: string[] = [];
const API = "https://firebasehosting.googleapis.com/v1beta1/";
const VERSION = "sites/rewire-it/versions/draft";
const OLD = "sites/rewire-it/versions/old";
const HASH = "a".repeat(64);
type Request = { method: string; url: string; json?: { files?: Record<string, string>; status?: string }; bodyFile?: string; retry?: boolean };
type FileEntry = { path: string; hash: string; status: string };
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "hosting-web-test-"));
  roots.push(root);
  await mkdir(path.join(root, "out/omics/releases/old"), { recursive: true });
  await writeFile(path.join(root, "out/index.html"), "new homepage");
  await writeFile(path.join(root, "out/deployment.json"), '{"schema":1}');
  await writeFile(path.join(root, "out/omics/manifest.json"), "never upload");
  await writeFile(path.join(root, "out/.secret"), "never upload");
  await writeFile(path.join(root, "out/firebase.json"), "never upload");
  const originals = new Map([
    ["/omics/manifest.json", HASH], ["/omics/releases/old/manifest.json", "b".repeat(64)],
    ["/omics/releases/old/catalogue.json", "c".repeat(64)], ["/omics/sources/evidence.md", "d".repeat(64)],
    ["/stale-ui/index.html", "e".repeat(64)],
  ]);
  const draft = new Map<string, string>();
  const uploaded = new Map<string, Buffer>();
  const events: string[] = [];
  let operationPolls = 0;
  const request = vi.fn(async (input: Request): Promise<Record<string, unknown>> => {
    const { method, url, json, bodyFile } = input;
    if (url.includes("/files?")) {
      expect(new URL(url).searchParams.get("status")).toBe("ACTIVE");
      const map = url.includes(`${OLD}/`) ? originals : draft;
      const index = Number(new URL(url).searchParams.get("pageToken") || 0);
      const entries = [...map].slice(index, index + 2);
      return { files: entries.map(([name, hash]) => ({ path: name, hash, status: "ACTIVE" })),
        ...(index + 2 < map.size ? { nextPageToken: String(index + 2) } : {}) };
    }
    if (url.endsWith("versions:clone")) {
      expect(json).toEqual({ sourceVersion: OLD, finalize: false, include: { regexes: ["^/omics/.*$"] } });
      expect(input.retry).toBe(false);
      for (const [name, hash] of originals) if (name.startsWith("/omics/")) draft.set(name, hash);
      return { name: "projects/123456/operations/clone-1" };
    }
    if (url.includes("/operations/")) {
      operationPolls++;
      return { done: true, response: { name: VERSION, status: "CREATED" } };
    }
    if (url.endsWith(":populateFiles")) {
      expect(Object.keys(json!.files!).length).toBeLessThanOrEqual(1000);
      for (const [name, hash] of Object.entries(json!.files!)) draft.set(name, hash);
      const historical = Object.keys(json!.files!).every((name) => name.startsWith("/omics/"));
      return { uploadRequiredHashes: historical ? [] : [...new Set(Object.values(json!.files!))],
        uploadUrl: `https://upload-firebasehosting.googleapis.com/upload/${VERSION}/files` };
    }
    if (bodyFile) {
      const bytes = await readFile(bodyFile);
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(url.endsWith(`/${hash}`)).toBe(true);
      uploaded.set(hash, gunzipSync(bytes));
      return {};
    }
    if (method === "PATCH") { events.push("finalize"); return { name: VERSION, status: "FINALIZED" }; }
    if (url.includes("/releases?")) {
      events.push("release");
      expect(input.retry).toBe(false);
      return { version: { name: VERSION } };
    }
    throw new Error(`Unexpected fake request ${method} ${url}`);
  });
  const beforeRelease = vi.fn(async () => { events.push("guard"); });
  const onReleaseAttempt = vi.fn(async () => { events.push("attempt"); });
  const options = { root, previousVersion: "old", client: { request }, beforeRelease, onReleaseAttempt, sleep: vi.fn(async () => {}), pollAttempts: 2 };
  return { root, originals, draft, uploaded, request, options, events, polls: () => operationPolls };
}

describe("immutable-history Hosting web publication", () => {
  it("records phase timings and transferred bytes, including failed uploads", async () => {
    const f = await fixture();
    const metricsFile = path.join(f.root, "metrics.jsonl");
    const metrics = createDeploymentMetrics({ file: metricsFile });
    await deployWebHosting({ ...f.options, metrics });
    const records = (await readFile(metricsFile, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(records.find(record => record.stage === "hosting.enumeration").files).toBe(2);
    expect(records.find(record => record.stage === "hosting.compression_hashing").compressed_bytes).toBeGreaterThan(0);
    expect(records.find(record => record.stage === "hosting.upload").uploaded_files).toBe(2);
    expect(records.find(record => record.stage === "hosting.upload").uploaded_bytes).toBeGreaterThan(0);
    expect(records.filter(record => record.stage === "hosting.remote_enumeration")).toHaveLength(4);
    expect(records.at(-1).stage).toBe("hosting.activation");
    expect(records.every(record => record.status === "success")).toBe(true);

    const failing = await fixture();
    const failureFile = path.join(failing.root, "metrics.jsonl");
    const request = failing.request.getMockImplementation()!;
    failing.request.mockImplementation(async input => {
      if (input.bodyFile) throw new Error("private transport details");
      return request(input);
    });
    await expect(deployWebHosting({ ...failing.options, metrics: createDeploymentMetrics({ file: failureFile }) })).rejects.toThrow("private transport details");
    const failureContent = await readFile(failureFile, "utf8");
    const failureRecords = failureContent.trim().split("\n").map(line => JSON.parse(line));
    expect(failureRecords.at(-1)).toMatchObject({ stage: "hosting.upload", status: "failed", uploaded_files: 0 });
    expect(failureContent).not.toContain("private transport details");
    expect(failing.options.onReleaseAttempt).not.toHaveBeenCalled();
  });

  it("paginates all history, excludes stale UI and ignored files, and guards the release", async () => {
    const f = await fixture();
    expect(await deployWebHosting(f.options)).toBe(VERSION);
    expect(f.events).toEqual(["finalize", "guard", "attempt", "release"]);
    expect(f.polls()).toBe(1);
    expect(f.draft.has("/stale-ui/index.html")).toBe(false);
    expect([...f.draft.keys()].filter((name) => !name.startsWith("/omics/"))).toEqual(["/deployment.json", "/index.html"]);
    for (const [name, hash] of f.originals) if (name.startsWith("/omics/")) expect(f.draft.get(name)).toBe(hash);
    expect([...f.uploaded.values()].map(String).sort()).toEqual(['{"schema":1}', "new homepage"].sort());
    expect(await readdir(path.join(f.root, "workbench"))).toEqual([]);
  });

  it("batches more than 1000 UI mappings and uploads identical content once", async () => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 1001 }, (_, i) => writeFile(path.join(f.root, "out", `page-${i}.html`), "shared")));
    await deployWebHosting(f.options);
    expect(f.request.mock.calls.filter(([r]) => r.url.endsWith(":populateFiles") && Object.keys(r.json!.files!).some((name) => !name.startsWith("/omics/")))).toHaveLength(2);
    expect(f.request.mock.calls.filter(([r]) => r.bodyFile)).toHaveLength(3);
  });

  it.each([undefined, 3])("bounds overlapping uploads with concurrency %s", async (concurrency) => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      writeFile(path.join(f.root, "out", `unique-${index}.html`), `Distinct page ${index}`)));
    const base = f.request.getMockImplementation()!;
    let active = 0, peak = 0;
    f.request.mockImplementation(async (request) => {
      if (!request.bodyFile) return base(request);
      active++; peak = Math.max(peak, active);
      try {
        // Hold the request for one event-loop turn so all pool workers overlap.
        await new Promise<void>(resolve => setImmediate(resolve));
        return await base(request);
      } finally { active--; }
    });
    await deployWebHosting({ ...f.options, ...(concurrency === undefined ? {} : { concurrency }) });
    if (concurrency === undefined) {
      expect(peak).toBeGreaterThan(6);
      expect(peak).toBeLessThanOrEqual(16);
    } else expect(peak).toBe(concurrency);
    expect(active).toBe(0);
    expect(f.uploaded.size).toBe(22);
    expect(await readdir(path.join(f.root, "workbench"))).toEqual([]);
  });

  it("waits for active uploads before deleting staging after a request fails", async () => {
    const f = await fixture();
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      writeFile(path.join(f.root, "out", `unique-${index}.html`), `Distinct page ${index}`)));
    const base = f.request.getMockImplementation()!;
    let unblock!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    const allStarted = new Promise<void>(resolve => { started = resolve; });
    let uploads = 0, settled = false;
    f.request.mockImplementation(async (request) => {
      if (!request.bodyFile) return base(request);
      const first = uploads++ === 0;
      if (uploads === 16) started();
      if (first) { await Promise.resolve(); throw new Error("Upload failed while peers remain active"); }
      await gate;
      // This reads the staging file after the first worker has already failed.
      return base(request);
    });
    const publication = deployWebHosting(f.options).finally(() => { settled = true; });
    const rejected = expect(publication).rejects.toThrow("Upload failed while peers remain active");
    await allStarted;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(await readdir(path.join(f.root, "workbench"))).toHaveLength(1);
    unblock();
    await rejected;
    expect(uploads).toBe(16); // Failure stops new work but lets the active streams finish.
    expect(f.uploaded.size).toBe(15);
    expect(f.events).not.toContain("release");
    expect(await readdir(path.join(f.root, "workbench"))).toEqual([]);
  });

  it.each(["symlink", "traversal"])("rejects %s input before creating a draft", async (mode) => {
    const f = await fixture();
    if (mode === "symlink") await symlink("index.html", path.join(f.root, "out/link.html"));
    else await writeFile(path.join(f.root, "out/%2e%2e%2fsecret"), "bad");
    await expect(deployWebHosting(f.options)).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("requires a historical manifest before clone and rejects wrong-site identity", async () => {
    const f = await fixture();
    f.originals.delete("/omics/manifest.json");
    await expect(deployWebHosting(f.options)).rejects.toThrow("lacks");
    expect(f.request.mock.calls.some(([r]) => r.url.endsWith("versions:clone"))).toBe(false);
    await expect(deployWebHosting({ ...f.options, previousVersion: "../bad" })).rejects.toThrow("Invalid");
  });

  it("rejects an incomplete historical release in the source version", async () => {
    const f = await fixture();
    f.originals.delete("/omics/releases/old/manifest.json");
    await expect(deployWebHosting(f.options)).rejects.toThrow("historical release manifest");
    expect(f.request.mock.calls.some(([r]) => r.url.endsWith("versions:clone"))).toBe(false);
  });

  it("does not upload content which populateFiles says already exists", async () => {
    const f = await fixture();
    const base = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (r) => {
      const response = await base(r);
      if (r.url.endsWith(":populateFiles")) response.uploadRequiredHashes = [];
      return response;
    });
    await deployWebHosting(f.options);
    expect(f.request.mock.calls.filter(([r]) => r.bodyFile)).toHaveLength(0);
  });

  it("accepts project-qualified identities only for the expected site/version", async () => {
    const f = await fixture();
    const base = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (r) => {
      const response = await base(r);
      if (response.response) (response.response as { name: string }).name = `projects/123456/${VERSION}`;
      if (r.method === "PATCH") response.name = `projects/123456/${VERSION}`;
      if (response.version) (response.version as { name: string }).name = `projects/123456/${VERSION}`;
      return response;
    });
    expect(await deployWebHosting(f.options)).toBe(VERSION);
  });

  it("repairs a partial clone by registering every historical path without uploading old bytes", async () => {
    const f = await fixture();
    f.originals.set("/__/firebase/init.js", "1".repeat(64));
    f.originals.set("/__/firebase/init.json", "2".repeat(64));
    for (let i = 0; i < 1001; i++) f.originals.set(`/omics/releases/old/chunk-${i}.json`, HASH);
    const base = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (r) => {
      const result = await base(r);
      if (r.url.endsWith("versions:clone")) {
        f.draft.clear();
        f.draft.set("/omics/sources/evidence.md", f.originals.get("/omics/sources/evidence.md")!);
        f.draft.set("/__/firebase/init.js", "1".repeat(64));
        f.draft.set("/__/firebase/init.json", "2".repeat(64));
      }
      return result;
    });
    expect(await deployWebHosting(f.options)).toBe(VERSION);
    const historyBatches = f.request.mock.calls.filter(([r]) => r.url.endsWith(":populateFiles") && Object.keys(r.json!.files!).every((name) => name.startsWith("/omics/")));
    expect(historyBatches).toHaveLength(2);
    expect(historyBatches.flatMap(([r]) => Object.keys(r.json!.files!))).toHaveLength(1005);
    expect(f.draft.get("/__/firebase/init.js")).toBe("1".repeat(64));
    expect(f.request.mock.calls.filter(([r]) => r.bodyFile)).toHaveLength(2);
  });

  it("refuses to fetch or upload missing previously published history", async () => {
    const f = await fixture();
    const base = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (r) => {
      const result = await base(r);
      if (r.url.endsWith(":populateFiles") && Object.keys(r.json!.files!).every((name) => name.startsWith("/omics/"))) result.uploadRequiredHashes = [HASH];
      return result;
    });
    await expect(deployWebHosting(f.options)).rejects.toThrow("Previously published history requires an upload");
    expect(f.options.onReleaseAttempt).not.toHaveBeenCalled();
    expect(f.request.mock.calls.filter(([r]) => r.bodyFile)).toHaveLength(0);
  });

  it.each(["unknown-managed", "absent-from-source", "changed-managed-hash"])("rejects %s files in a clone", async (mode) => {
    const f = await fixture();
    if (mode === "changed-managed-hash") f.originals.set("/__/firebase/init.js", "1".repeat(64));
    const base = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (r) => {
      const result = await base(r);
      if (r.url.endsWith("versions:clone")) f.draft.set(mode === "unknown-managed" ? "/__/arbitrary.js" : "/__/firebase/init.js", "2".repeat(64));
      return result;
    });
    await expect(deployWebHosting(f.options)).rejects.toThrow("unexpected file or changed hash");
    expect(f.options.onReleaseAttempt).not.toHaveBeenCalled();
  });

  it.each(["foreign", "missing", "unknown", "duplicate", "traversal", "mutation", "timeout", "operation-error", "wrong-site", "finalize", "upload", "clone", "pagination-loop", "foreign-operation"])(
    "does not release a partial or untrusted draft after %s", async (mode) => {
      const f = await fixture();
      const base = f.request.getMockImplementation()!;
      let draftLists = 0;
      f.request.mockImplementation(async (r: Request) => {
        if (mode === "upload" && r.bodyFile) throw new Error("Upload failed");
        if (mode === "clone" && r.url.endsWith("versions:clone")) throw new Error("Clone response lost");
        if (mode === "foreign-operation" && r.url.endsWith("versions:clone")) return { name: "https://attacker.example/operations/clone" };
        if (mode === "timeout" && r.url.includes("/operations/")) return { name: "projects/123456/operations/clone-1" };
        if (mode === "operation-error" && r.url.includes("/operations/")) return { done: true, error: { code: 13 } };
        if (mode === "wrong-site" && r.url.includes("/operations/")) return { done: true, response: { name: "sites/other/versions/draft", status: "CREATED" } };
        const response = await base(r);
        if (r.url.endsWith(":populateFiles")) {
          if (mode === "foreign") response.uploadUrl = "https://attacker.example/files";
          if (mode === "unknown") response.uploadRequiredHashes = ["f".repeat(64)];
        }
        if (r.url.includes(`${VERSION}/files?`)) {
          draftLists++;
          const files = response.files as FileEntry[];
          if (mode === "missing") response.files = files.filter((file) => file.path !== "/omics/releases/old/manifest.json");
          if (mode === "duplicate" && files.length) response.files = [...files, files[0]];
          if (mode === "traversal" && files.length) files[0].path = "/omics/../secret";
          if (mode === "mutation" && draftLists > 2 && files.length) files[0].hash = "f".repeat(64);
          if (mode === "pagination-loop") response.nextPageToken = "2";
        }
        if (mode === "finalize" && r.method === "PATCH") response.status = "CREATED";
        return response;
      });
      await expect(deployWebHosting(f.options)).rejects.toThrow();
      expect(f.options.onReleaseAttempt).not.toHaveBeenCalled();
      expect(f.events).not.toContain("release");
      expect(await readdir(path.join(f.root, "workbench"))).toEqual([]);
    },
  );

  it("aborts a stale live-state guard without marking a release attempt", async () => {
    const f = await fixture();
    f.options.beforeRelease.mockRejectedValue(new Error("Live version changed"));
    await expect(deployWebHosting(f.options)).rejects.toThrow("Live version changed");
    expect(f.events).toEqual(["finalize"]);
    expect(f.options.onReleaseAttempt).not.toHaveBeenCalled();
  });

  it("marks ambiguous release failure for outer rollback and does not repeat it", async () => {
    const f = await fixture();
    const base = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (r) => { if (r.url.includes("/releases?")) throw new Error("response lost"); return base(r); });
    await expect(deployWebHosting(f.options)).rejects.toThrow("response lost");
    expect(f.options.onReleaseAttempt).toHaveBeenCalledOnce();
    expect(f.request.mock.calls.filter(([r]) => r.url.includes("/releases?"))).toHaveLength(1);
  });
});

describe("official Hosting transport", () => {
  it("refreshes request headers, retries transient safe operations, and forbids redirects", async () => {
    const auth = { getRequestHeaders: vi.fn(async () => ({ authorization: "Bearer test-only" })) };
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response("{}"));
    const client = await createHostingClient({ auth, fetchImpl, sleep: vi.fn(async () => {}) });
    expect(await client.request({ method: "GET", url: `${API}${OLD}` })).toEqual({});
    expect(auth.getRequestHeaders).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].redirect).toBe("error");
  });

  it("does not retry ambiguous writes or non-transient errors and rejects credential destinations", async () => {
    const auth = { getRequestHeaders: vi.fn(async () => ({})) };
    const fetchImpl = vi.fn().mockRejectedValue(new Error("lost response"));
    const client = await createHostingClient({ auth, fetchImpl, sleep: vi.fn(async () => {}) });
    await expect(client.request({ method: "POST", url: `${API}sites/rewire-it/versions:clone`, retry: false })).rejects.toThrow("transport");
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockReset().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(client.request({ method: "GET", url: `${API}${OLD}` })).rejects.toThrow("403");
    expect(fetchImpl).toHaveBeenCalledOnce();
    await expect(client.request({ method: "GET", url: "https://attacker.example/" })).rejects.toThrow("Untrusted");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("full publication history guard", () => {
  async function fullFixture() {
    const f = await fixture();
    await mkdir(path.join(f.root, "out/omics/sources"));
    await writeFile(path.join(f.root, "out/omics/releases/old/manifest.json"), "checked archive manifest");
    await writeFile(path.join(f.root, "out/omics/releases/old/catalogue.json"), "checked archive catalogue");
    await writeFile(path.join(f.root, "out/omics/sources/evidence.md"), "checked source");
    return f;
  }

  it("requires all historical/source downloads but permits changed current pointers and removed UI", async () => {
    const f = await fullFixture();
    await rm(path.join(f.root, "out/omics/manifest.json"));
    expect(await assertHistoricalDownloadsPresent(f.options)).toBe(3);
    expect(f.request.mock.calls.every(([request]) => request.method === "GET")).toBe(true);
    expect(f.request.mock.calls.length).toBeGreaterThan(1);
  });

  it.each(["release", "source", "file-symlink", "directory-symlink"])("refuses full publication for missing or unsafe %s", async (mode) => {
    const f = await fullFixture();
    if (mode === "release") await rm(path.join(f.root, "out/omics/releases/old/catalogue.json"));
    if (mode === "source") await rm(path.join(f.root, "out/omics/sources/evidence.md"));
    if (mode === "file-symlink") {
      await rm(path.join(f.root, "out/omics/sources/evidence.md"));
      await symlink("../manifest.json", path.join(f.root, "out/omics/sources/evidence.md"));
    }
    if (mode === "directory-symlink") {
      await rm(path.join(f.root, "out/omics/sources"), { recursive: true });
      await symlink("releases/old", path.join(f.root, "out/omics/sources"));
    }
    await expect(assertHistoricalDownloadsPresent(f.options)).rejects.toThrow("Archive the published release/source with verified checksums");
    expect(f.request.mock.calls.every(([request]) => request.method === "GET")).toBe(true);
  });
});
