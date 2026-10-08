import { describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { NextRequest } from "next/server";
import { checkCompiledData, checkReceipt } from "../scripts/server-entry.mjs";
import { middleware } from "../middleware";
import { downloadRedirect } from "../lib/download-map";
import { GET as receiptRoute } from "../app/deployment.json/route";
import { hydrateRuntimeData, renderEntries } from "../scripts/runtime-data.mjs";
import { fetchRecordPage, RecordPageUnavailable } from "../lib/record-page";
import { localRecordPage } from "../lib/record-page-local";
import lock from "../benchmark-data.lock.json";

const sha = (bytes: Buffer | string) => crypto.createHash("sha256").update(bytes).digest("hex");
const FRONTEND = "c".repeat(40);

describe("frontend origin identity, downloads and receipts", () => {
  const pin = { ...lock };
  const call = (url: string, init: RequestInit = {}) => {
    vi.stubEnv("REWIRE_FRONTEND_VERSION", FRONTEND);
    vi.stubEnv("REWIRE_DATA_RELEASE", pin.release_id);
    try { return middleware(new NextRequest(new URL(url, "https://origin.test"), init as never)); }
    finally { vi.unstubAllEnvs(); }
  };

  it("stamps every response with the image and runtime data identity", () => {
    const response = call("/database/result/x/");
    expect(response.headers.get("x-rewire-frontend")).toBe(FRONTEND);
    expect(response.headers.get("x-rewire-data-release")).toBe(pin.release_id);
    expect(response.headers.get("x-rewire-edge-cache")).toBe("public");
  });
  // RSC headers never reach middleware in a running server; the Worker refuses those requests.
  it.each([
    ["a cookie", { headers: { cookie: "a=1" } }],
    ["an authorization header", { headers: { authorization: "Bearer x" } }],
    ["a POST", { method: "POST" }],
  ])("does not opt %s into the edge cache", (_name, init) => {
    expect(call("/models/", init).headers.get("x-rewire-edge-cache")).toBeNull();
  });
  it("never opts private paths in", () => {
    for (const url of ["/contribute/", "/_analytics/", "/models/?_rsc=1", "/deployment.json", "/omics/manifest.json"])
      expect(call(url).headers.get("x-rewire-edge-cache")).toBeNull();
  });
  it("redirects listed downloads to the exact pinned source and 404s anything else", () => {
    const path = `/omics/releases/${pin.release_id}/records.csv`;
    const found = downloadRedirect(path, new Request(`https://origin.test${path}?download=1`));
    expect(found.status).toBe(307);
    expect(found.headers.get("location")).toBe(`https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/data/omics/releases/${pin.release_id}/records.csv.gz?download=1`);
    expect(found.headers.get("cache-control")).toBe("no-store");
    for (const missing of [`${path}.gz`, "/omics/releases/invented/records.csv"])
      expect(downloadRedirect(missing, new Request(`https://origin.test${missing}`)).status).toBe(404);
  });
  it("serves its publication receipt uncached, and none without one", async () => {
    vi.stubEnv("REWIRE_DEPLOYMENT_RECEIPT", JSON.stringify({ release_id: pin.release_id }));
    const response = receiptRoute();
    vi.unstubAllEnvs();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).release_id).toBe(pin.release_id);
    expect(receiptRoute().status).toBe(404);
  });
  it("refuses to start a reused image whose compiled taxonomy the pinned release changes", () => {
    const manifest = { files: [{ destination: "lib/generated-benchmark-catalog.ts", sha256: "a".repeat(64) }] };
    expect(() => checkCompiledData({ "lib/generated-benchmark-catalog.ts": "a".repeat(64) }, manifest)).not.toThrow();
    expect(() => checkCompiledData({ "lib/generated-benchmark-catalog.ts": "b".repeat(64) }, manifest)).toThrow(/build a new image/);
    expect(() => checkCompiledData({ "lib/generated-benchmark-catalog.ts": "a".repeat(64) }, { files: [] })).toThrow();
  });
  it("refuses a deployment receipt for another image or data pin", () => {
    const manifest = Buffer.from("{}");
    const receipt = { frontend_version: FRONTEND, release_id: pin.release_id, producer_repository: pin.repository, producer_revision: pin.revision,
      producer_manifest_sha256: pin.manifest_sha256, manifest_sha256: sha(manifest) };
    expect(checkReceipt(receipt, pin, FRONTEND, manifest)).toBe(receipt);
    expect(() => checkReceipt({ ...receipt, frontend_version: "d".repeat(40) }, pin, FRONTEND, manifest)).toThrow();
    expect(() => checkReceipt({ ...receipt, producer_revision: "e".repeat(40) }, pin, FRONTEND, manifest)).toThrow();
    expect(() => checkReceipt(receipt, pin, FRONTEND, Buffer.from("changed"))).toThrow();
  });
});

describe("runtime data hydration", () => {
  const files = [
    { destination: "public/omics/catalogue.json", body: '{"release_id":"2026-10-07-1448159e6a81"}' },
    { destination: "public/omics/manifest.json", body: '{"release_id":"2026-10-07-1448159e6a81"}' },
    { destination: "public/omics/releases/2026-10-07-1448159e6a81/records.csv", body: "id\n" },
  ];
  function producer(overrides: Partial<Record<string, Buffer>> = {}) {
    const manifest = { schema_version: 1, release_id: lock.release_id, files: files.map(file => ({
      destination: file.destination, source: `website/files/${file.destination}.gz`, sha256: sha(file.body), bytes: Buffer.byteLength(file.body), scope: "current",
    })) };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const pin = { ...lock, manifest_sha256: sha(manifestBytes) };
    const objects = new Map<string, Buffer>([[`website/manifest.json`, manifestBytes],
      ...files.map(file => [`website/files/${file.destination}.gz`, zlib.gzipSync(file.body)] as [string, Buffer])]);
    for (const [key, value] of Object.entries(overrides)) objects.set(key, value!);
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const key = url.replace(`https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/`, "");
      requested.push(key);
      const body = objects.get(key);
      return body ? new Response(body) : new Response("missing", { status: 404 });
    });
    return { pin, fetchImpl, requested };
  }
  it("fetches only rendered files at the pinned revision and verifies each one", async () => {
    const { pin, fetchImpl, requested } = producer();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-runtime-"));
    try {
      const directory = await hydrateRuntimeData(pin, root, { fetchImpl: fetchImpl as never });
      expect(fs.readFileSync(path.join(directory, "public/omics/catalogue.json"), "utf8")).toBe(files[0].body);
      expect(requested).not.toContain("website/files/public/omics/releases/2026-10-07-1448159e6a81/records.csv.gz");
      expect(await hydrateRuntimeData(pin, root, { fetchImpl: fetchImpl as never })).toBe(directory);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("refuses a manifest that does not match the pin and any altered file", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-runtime-"));
    try {
      const wrong = producer();
      await expect(hydrateRuntimeData({ ...wrong.pin, manifest_sha256: "0".repeat(64) }, root, { fetchImpl: wrong.fetchImpl as never })).rejects.toThrow("digest");
      const altered = producer({ "website/files/public/omics/catalogue.json.gz": zlib.gzipSync('{"release_id":"x"}') });
      await expect(hydrateRuntimeData(altered.pin, root, { fetchImpl: altered.fetchImpl as never })).rejects.toThrow(/checksum|size/);
      expect(fs.readdirSync(root)).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it("selects the files pages read from the real pinned manifest", () => {
    const manifest = JSON.parse(fs.readFileSync("workbench/benchmark-data/website/manifest.json", "utf8"));
    const selected = renderEntries(manifest, lock.release_id).map((entry: { destination: string }) => entry.destination);
    expect(selected).toContain("public/omics/catalogue.json");
    expect(selected).toContain(`public/omics/releases/${lock.release_id}/use-cases.json`);
    expect(selected.some((name: string) => name.endsWith(".csv") && name.startsWith("public/omics/releases/"))).toBe(false);
  });
});

describe("prepared page loader", () => {
  const ok = (data: unknown) => vi.fn(async () => new Response(JSON.stringify({ result: { data } }), { status: 200 }));
  const route = (() => {
    const catalogue = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8"));
    return catalogue.records.find((record: { kind: string; status: string }) => record.kind === "result" && record.status !== "excluded").id as string;
  })();
  it("requests the pinned release and returns a matching page", async () => {
    const page = localRecordPage("result", route)!;
    const fetchImpl = ok(page);
    expect(await fetchRecordPage("result", route, { api: "https://api.test", fetchImpl })).toEqual(page);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(JSON.parse(decodeURIComponent(new URL(url).searchParams.get("input")!))).toEqual({ release_id: lock.release_id, kind: "result", id: route });
  });
  it("treats a null page as absent and an invalid ID as absent without calling the API", async () => {
    expect(await fetchRecordPage("result", route, { api: "https://api.test", fetchImpl: ok(null) })).toBeNull();
    const fetchImpl = vi.fn();
    expect(await fetchRecordPage("result", "../secret", { api: "https://api.test", fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("turns API errors, timeouts and network failures into backend failures, never 404s", async () => {
    for (const status of [404, 412, 500, 503]) {
      await expect(fetchRecordPage("result", route, { api: "https://api.test", fetchImpl: vi.fn(async () => new Response("{}", { status })) })).rejects.toBeInstanceOf(RecordPageUnavailable);
    }
    await expect(fetchRecordPage("result", route, { api: "https://api.test", fetchImpl: vi.fn(async () => { throw new TypeError("fetch failed"); }) })).rejects.toBeInstanceOf(RecordPageUnavailable);
  });
  it("rejects a page from another release, route or kind", async () => {
    const page = localRecordPage("result", route)!;
    for (const data of [{ ...page, release_id: "2026-01-01-aaaaaaaaaaaa" }, { ...page, route_kind: "evaluation" }]) {
      await expect(fetchRecordPage("result", route, { api: "https://api.test", fetchImpl: ok(data) })).rejects.toThrow("another release or route");
    }
    await expect(fetchRecordPage("result", "other-id", { api: "https://api.test", fetchImpl: ok(page) })).rejects.toThrow("another release or route");
  });
});
