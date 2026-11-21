import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { FIRST_RELEASE_COMMIT_CHECKED, checkReleaseCommit, chooseRelease, lockFor, releaseCommitChecked, servingReleases, withheldMappings } from "../scripts/adopt-data-release.mjs";
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
  it("refuses a serving tag whose commit is not made directly on the commit the release was built from", () => {
    const tag = "serving/2026-11-22-ffffffffffff";
    const revision = "c".repeat(40);
    const built = "b".repeat(40);
    const config = Buffer.from(JSON.stringify({ schema_version: "1.0", source_revision: built }));
    expect(checkReleaseCommit({ tag, revision, parents: [built], config })).toBe(built);
    // A commit on another parent: main moved, and the tag was put on a rebased commit.
    expect(() => checkReleaseCommit({ tag, revision, parents: ["d".repeat(40)], config })).toThrow(`Refusing ${tag}`);
    // A merge commit, even one whose first parent is the built commit.
    expect(() => checkReleaseCommit({ tag, revision, parents: [built, "d".repeat(40)], config })).toThrow("only parent");
    expect(() => checkReleaseCommit({ tag, revision, parents: [], config })).toThrow("(none)");
    expect(() => checkReleaseCommit({ tag, revision, parents: [built], config: Buffer.from("{}") })).toThrow("no source_revision");
    expect(() => checkReleaseCommit({ tag, revision, parents: [built], config: Buffer.from("not json") })).toThrow("not valid JSON");
  });
  it("checks the release commit from the first guaranteed release on, and never an older one", () => {
    const releases = servingReleases([
      release("2026-11-20-ffffffffffff", "2026-11-20T10:25:31Z"),
      release(FIRST_RELEASE_COMMIT_CHECKED, "2026-11-21T03:59:20Z"),
      // Published later the same day, with an ID that sorts before the first checked one.
      release("2026-11-21-000000000000", "2026-11-21T09:00:00Z"),
      release("2026-11-22-aaaaaaaaaaaa", "2026-11-22T09:00:00Z"),
    ]);
    expect(releaseCommitChecked(releases, "2026-11-20-ffffffffffff")).toBe(false);
    expect(releaseCommitChecked(releases, FIRST_RELEASE_COMMIT_CHECKED)).toBe(true);
    expect(releaseCommitChecked(releases, "2026-11-21-000000000000")).toBe(true);
    expect(releaseCommitChecked(releases, "2026-11-22-aaaaaaaaaaaa")).toBe(true);
    // Once the first checked release is no longer in the listing, everything listed is newer.
    expect(releaseCommitChecked(releases.slice(2), "2026-11-22-aaaaaaaaaaaa")).toBe(true);
    expect(releaseCommitChecked(releases, "2026-11-23-bbbbbbbbbbbb")).toBe(true);
  });
  it("names live mappings the new release withholds, but not deliberate review changes", () => {
    const previous = { mappings: [{ id: "a", lifecycle: "active" }, { id: "b", lifecycle: "active" }, { id: "c", lifecycle: "needs_review" }] };
    const next = { mappings: [
      { id: "a", lifecycle: "needs_review", stale_from: { lifecycle: "active" } },
      { id: "b", lifecycle: "withdrawn" },
      { id: "c", lifecycle: "needs_review", stale_from: { lifecycle: "active" } },
    ] };
    expect(withheldMappings(previous, next)).toEqual(["a"]);
    expect(withheldMappings(null, next)).toEqual([]);
  });
});
