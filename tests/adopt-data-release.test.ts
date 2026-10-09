import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { chooseRelease, lockFor, servingReleases } from "../scripts/adopt-data-release.mjs";
import lock from "../benchmark-data.lock.json";

const release = (id: string, createdAt: string, extra = {}) => ({ tagName: `serving/${id}`, createdAt, isDraft: false, ...extra });
const listing = [
  release("2026-10-09-cccccccccccc", "2026-10-09T15:00:00Z"),
  { tagName: "kg/2026-10-09-cccccccccccc", createdAt: "2026-10-09T15:00:00Z", isDraft: false },
  release("2026-10-07-aaaaaaaaaaaa", "2026-10-07T10:00:00Z"),
  release("2026-10-09-bbbbbbbbbbbb", "2026-10-09T13:00:00Z"),
  release("2026-10-10-dddddddddddd", "2026-10-10T09:00:00Z", { isDraft: true }),
];

describe("data release adoption", () => {
  it("orders published prepared releases by publication time, ignoring other tags and drafts", () => {
    expect(servingReleases(listing).map((r: { tagName: string }) => r.tagName)).toEqual([
      "serving/2026-10-07-aaaaaaaaaaaa", "serving/2026-10-09-bbbbbbbbbbbb", "serving/2026-10-09-cccccccccccc"]);
  });
  it("adopts the newest release, does nothing when current, and never moves backwards", () => {
    const releases = servingReleases(listing);
    expect(chooseRelease(releases, "2026-10-07-aaaaaaaaaaaa")).toBe("2026-10-09-cccccccccccc");
    expect(chooseRelease(releases, "2026-10-09-cccccccccccc")).toBeNull();
    expect(chooseRelease(releases, "2026-10-07-aaaaaaaaaaaa", "2026-10-09-bbbbbbbbbbbb")).toBe("2026-10-09-bbbbbbbbbbbb");
    expect(() => chooseRelease(releases, "2026-10-09-cccccccccccc", "2026-10-07-aaaaaaaaaaaa")).toThrow("older");
    expect(() => chooseRelease(releases, "2026-10-07-aaaaaaaaaaaa", "2026-10-11-eeeeeeeeeeee")).toThrow("No published");
  });
  it("pins the tag commit, the manifest digest and the published receipt, and refuses mismatches", () => {
    const releaseId = "2026-10-09-cccccccccccc";
    const manifest = Buffer.from(JSON.stringify({ release_id: releaseId }));
    const receipt = { release_id: releaseId, file: `catalogue-${releaseId}.sqlite`, sha256: "f".repeat(64) };
    const revision = "a".repeat(40);
    expect(lockFor(lock, { releaseId, revision, manifest, receipt })).toEqual({
      schema_version: 1, repository: "rewire-bio/rewire-benchmark-data", revision,
      manifest_sha256: crypto.createHash("sha256").update(manifest).digest("hex"), release_id: releaseId,
      serving: { tag: `serving/${releaseId}`, file: receipt.file, sha256: receipt.sha256 },
    });
    expect(() => lockFor(lock, { releaseId, revision, manifest: Buffer.from('{"release_id":"2026-10-07-aaaaaaaaaaaa"}'), receipt })).toThrow("manifest");
    expect(() => lockFor(lock, { releaseId, revision, manifest, receipt: { ...receipt, release_id: "2026-10-07-aaaaaaaaaaaa" } })).toThrow("receipt");
  });
});
