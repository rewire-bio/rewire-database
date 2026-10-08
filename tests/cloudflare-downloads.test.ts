import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { checkGithubDownloads } from "../scripts/check-cloudflare-ranges.mjs";

const revision = "a".repeat(40);
const locations = { repository: "rewire-bio/rewire-benchmark-data", revision, groups: [{ destination: "/omics", source: "website/files/public/omics", files: ["manifest.json"] }, { destination: "/omics/releases/id", source: "data/omics/releases/id", files: ["audit-runs.json"] }] };
const exportBytes = Buffer.from('{"runs":[]}');
const manifestBytes = Buffer.from(JSON.stringify({ release_id: "id", files: { "audit-runs.json": createHash("sha256").update(exportBytes).digest("hex") } }));
function fetcher({ wrongTarget = false, corrupt = false } = {}) {
  return async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://frontend.test")) {
      const pathname = new URL(url).pathname;
      const source = pathname === "/omics/manifest.json" ? "website/files/public/omics/manifest.json.gz" : "data/omics/releases/id/audit-runs.json.gz";
      return new Response(null, { status: 307, headers: { location: `https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/${wrongTarget ? "b".repeat(40) : revision}/${source}`, "cache-control": "no-store" } });
    }
    const bytes = corrupt ? Buffer.from("changed") : url.endsWith("manifest.json.gz") ? manifestBytes : exportBytes;
    return new Response(new Uint8Array(gzipSync(bytes)));
  };
}
describe("GitHub download acceptance", () => {
  it("checks manifest and scientific gzip bytes against release hashes", async () => {
    expect(await checkGithubDownloads("https://frontend.test", { locations, manifestBytes, fetcher: fetcher() })).toBe(2);
  });
  it("rejects a redirect to a different producer revision", async () => {
    await expect(checkGithubDownloads("https://frontend.test", { locations, manifestBytes, fetcher: fetcher({ wrongTarget: true }) })).rejects.toThrow();
  });
  it("rejects mutated export bytes", async () => {
    await expect(checkGithubDownloads("https://frontend.test", { locations, manifestBytes, fetcher: fetcher({ corrupt: true }) })).rejects.toThrow("Changed export bytes");
  });
});
