import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { FIRST_RELEASE_COMMIT_CHECKED, checkReleaseCommit, chooseRelease, lockFor, rebuiltByProducerChecks, releaseCommitChecked, servingReleases, withheldMappings } from "../scripts/adopt-data-release.mjs";
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
  it("orders published prepared releases by creation time, ignoring other tags and drafts", () => {
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
  describe("the commit a serving tag names", () => {
    // A real repository, because the check reads parents, trees and ancestry from Git.
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "release-commit-"));
    afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.org", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const head = () => git("rev-parse", "HEAD").trim();
    const write = (file: string, text: string) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
    const commit = (message: string, files: Record<string, string>) => { for (const [file, text] of Object.entries(files)) write(file, text); git("add", "-A"); git("commit", "--quiet", "-m", message); return head(); };
    const config = (built: string) => JSON.stringify({ schema_version: "1.0", source_revision: built });
    /** A release commit as the producer makes it: the config names the commit it is made on. */
    const release = (id: string, extra: Record<string, string> = {}) => {
      const built = head();
      return commit(`Cut release ${id} [skip ci]`, { "data/omics/release-config.json": config(built), "website/manifest.json": id, ...extra });
    };
    const at = (ref: string, branch: string) => git("checkout", "--quiet", "-B", branch, ref);
    /** What the producer's main is, as the clone sees it. */
    const main = (ref: string) => git("update-ref", "refs/remotes/origin/main", ref);
    const tag = "serving/2026-11-22-ffffffffffff";
    const check = (revision: string, rebuilt = false) => checkReleaseCommit({ tag, revision, git, rebuilt: async () => rebuilt });

    git("init", "--quiet", "-b", "main");
    const first = commit("First", { "shared/omics/a.ts": "1", "data/omics/release-config.json": config("0".repeat(40)) });
    const built = commit("A pull request", { "shared/omics/a.ts": "2" });
    const released = release("2026-11-22-ffffffffffff");
    main(released);

    it("accepts an automated release commit: made on the built commit, changing only release paths", async () => {
      expect(await check(released)).toEqual({ kind: "release commit", built });
      // Main moved while the release was cut, and the release commit was merged into it.
      at(built, "moved");
      const moved = commit("Another pull request", { "shared/omics/b.ts": "1" });
      git("merge", "--quiet", "--no-ff", "-m", "Cut release 2026-11-22-ffffffffffff [skip ci]", released);
      const merged = head();
      main(merged);
      expect(await check(released)).toEqual({ kind: "release commit", built });
      // The tag belongs on the release commit, not on its merge into main, which holds other code.
      await expect(check(merged)).rejects.toThrow(`has parent ${moved} and ${released}`);
      main(released);
    });

    it("refuses the built commit, a later commit and a rebased release commit", async () => {
      await expect(check(built)).rejects.toThrow(`Refusing ${tag}`);
      at(released, "later");
      const later = commit("A later pull request", { "shared/omics/a.ts": "3" });
      main(later);
      await expect(check(later)).rejects.toThrow(`has parent ${released}, but its release config says the release was built from ${built}`);
      // Main moved and the release commit was replayed on it: one parent, but not the built commit.
      at(built, "rebased");
      const other = commit("Another pull request", { "shared/omics/b.ts": "1" });
      git("cherry-pick", released);
      const rebased = head();
      main(rebased);
      await expect(check(rebased)).rejects.toThrow(`has parent ${other}, but its release config says the release was built from ${built}`);
      main(released);
    });

    it("refuses a commit that only vouches for itself", async () => {
      // On a side branch: its parent and its config agree, and it changes shared code.
      at(built, "side");
      const side = release("2026-11-22-ffffffffffff", { "shared/omics/a.ts": "changed" });
      main(released);
      await expect(check(side)).rejects.toThrow("not on main");
      // Even with a run that claims it: a commit that is not on main is never adopted.
      await expect(check(side, true)).rejects.toThrow("not on main");
      // On main: an ordinary commit whose config names its own parent while it changes shared code.
      main(side);
      await expect(check(side)).rejects.toThrow("changes files outside data/ and website/ (shared/omics/a.ts)");
      main(released);
    });

    it("accepts a release cut by hand only where the producer's checks rebuilt it", async () => {
      // The pull request branch: prepared on one commit, then changed again.
      at(built, "by-hand");
      const prepared = commit("Fix a reader", { "shared/omics/a.ts": "4" });
      commit("Prepare release", { "data/omics/release-config.json": config(prepared), "website/manifest.json": "by hand" });
      const branch = head();
      // Merged with a merge commit into a main that has moved.
      at(built, "main-merge");
      commit("Another pull request", { "shared/omics/b.ts": "1" });
      git("merge", "--quiet", "--no-ff", "-m", "Merge pull request #1", branch);
      const merge = head();
      main(merge);
      expect(await check(merge, true)).toEqual({ kind: "rebuilt by the producer checks", built: null });
      await expect(check(merge)).rejects.toThrow("rebuilt and published a release from that commit");
      // Squashed onto a main that has moved: one parent, and not the commit it was prepared on.
      at(built, "main-squash");
      commit("Another pull request", { "shared/omics/b.ts": "1" });
      git("merge", "--quiet", "--squash", branch);
      git("commit", "--quiet", "-m", "Release by hand (#1)");
      const squash = head();
      main(squash);
      expect(await check(squash, true)).toEqual({ kind: "rebuilt by the producer checks", built: null });
      await expect(check(squash)).rejects.toThrow(`Refusing ${tag}`);
      main(released);
    });

    it("refuses a commit with no readable release config", async () => {
      main(first);
      at(first, "broken");
      const broken = commit("Break the config", { "data/omics/release-config.json": "not json" });
      main(broken);
      await expect(check(broken, true)).rejects.toThrow("no readable data/omics/release-config.json");
      main(released);
    });
  });
  it("counts a producer run as a rebuild only when its publish job ran", () => {
    const revision = "c".repeat(40);
    const api = (jobs: Record<string, unknown>[][]) => (route: string) => {
      if (route.includes("/actions/workflows/data.yml/runs?")) {
        expect(route).toContain(`head_sha=${revision}`);
        expect(route).toContain("event=push");
        expect(route).toContain("branch=main");
        return { workflow_runs: jobs.map((_, id) => ({ id })) };
      }
      return { jobs: jobs[Number(route.match(/runs\/(\d+)\/jobs/)?.[1])] };
    };
    const passed = [{ name: "checks (store)", status: "completed", conclusion: "success" }, { name: "release", status: "completed", conclusion: "success" }];
    // The website is asked to adopt from inside the publish job.
    expect(rebuiltByProducerChecks(revision, api([[...passed, { name: "publish", status: "in_progress", conclusion: null }]]))).toBe(true);
    expect(rebuiltByProducerChecks(revision, api([[...passed, { name: "publish", status: "completed", conclusion: "success" }]]))).toBe(true);
    // It started, so the rebuild had passed, and failed at a later step such as the website dispatch.
    expect(rebuiltByProducerChecks(revision, api([[...passed, { name: "publish", status: "completed", conclusion: "failure" }]]))).toBe(true);
    // An ordinary push to main: the checks pass and nothing is published.
    expect(rebuiltByProducerChecks(revision, api([[...passed, { name: "publish", status: "completed", conclusion: "skipped" }]]))).toBe(false);
    expect(rebuiltByProducerChecks(revision, api([[...passed, { name: "publish", status: "queued", conclusion: null }]]))).toBe(false);
    expect(rebuiltByProducerChecks(revision, api([passed]))).toBe(false);
    // An automated release commit carries [skip ci], so it has no run at all.
    expect(rebuiltByProducerChecks(revision, api([]))).toBe(false);
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
