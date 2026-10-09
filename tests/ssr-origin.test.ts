import { describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { checkPrepared, checkReceipt } from "../scripts/server-entry.mjs";
import { fetchServingData, verifyServing } from "../scripts/fetch-serving-data.mjs";
import { middleware } from "../middleware";
import { downloadRedirect } from "../lib/download-map";
import { GET as receiptRoute } from "../app/deployment.json/route";
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
    const path = `/omics/releases/${pin.release_id}/records.jsonl`;
    const found = downloadRedirect(path, new Request(`https://origin.test${path}?download=1`));
    expect(found.status).toBe(307);
    expect(found.headers.get("location")).toBe(`https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/data/omics/releases/${pin.release_id}/records.jsonl.gz?download=1`);
    expect(found.headers.get("cache-control")).toBe("no-store");
    for (const missing of [`${path}.gz`, "/omics/releases/invented/records.jsonl"])
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

describe("embedded prepared release", () => {
  const serving = verifyServing(lock);
  it("starts only with the pinned release in a supported contract", () => {
    const file = path.join("serving", serving.file);
    expect(checkPrepared(file, lock).release_id).toBe(lock.release_id);
    expect(() => checkPrepared(file, { ...lock, release_id: "2000-01-01-000000000000" })).toThrow("not the pinned");
  });
  it("refuses a lock without a serving pin for its own release", () => {
    expect(() => verifyServing({ ...lock, serving: undefined })).toThrow("serving");
    expect(() => verifyServing({ ...lock, serving: { ...serving, tag: "serving/2000-01-01-000000000000" } })).toThrow("serving");
  });
  it("downloads the pinned file once and refuses altered bytes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rewire-serving-"));
    try {
      const body = Buffer.from("prepared release bytes");
      const pinned = { ...lock, serving: { ...serving, sha256: sha(body) } };
      fs.writeFileSync(path.join(root, "benchmark-data.lock.json"), JSON.stringify(pinned));
      const fetchImpl = vi.fn(async () => new Response(body));
      const file = await fetchServingData({ root, fetchImpl: fetchImpl as never });
      expect(fs.readFileSync(file)).toEqual(body);
      expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe(`https://github.com/${lock.repository}/releases/download/${serving.tag}/${serving.file}`);
      await fetchServingData({ root, fetchImpl: fetchImpl as never });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      fs.rmSync(file);
      await expect(fetchServingData({ root, fetchImpl: (async () => new Response("altered")) as never })).rejects.toThrow("differs from the lock");
      expect(fs.readdirSync(path.join(root, "serving"))).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
