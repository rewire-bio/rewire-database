import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { logExcerpt, outcomeOf, plan, readState, sourceOf, staleness } from "../scripts/ops/pipeline-alert.mjs";

// The workflows whose failures on main open the pipeline-broken issue in this repository.
const WATCHED = ["adopt-data-release.yml", "firebase.yml"];

const now = "2026-11-17T12:00:00.000Z";
const failed = { source: "release.yml", outcome: "fail" as const, url: "https://run/1", summary: "job `release` failure", details: "```\nboom\n```", now };

describe("outcomeOf", () => {
  it("counts failures and successes on main only", () => {
    expect(outcomeOf({ head_branch: "main", event: "workflow_run", conclusion: "failure" })).toBe("fail");
    expect(outcomeOf({ head_branch: "main", event: "push", conclusion: "timed_out" })).toBe("fail");
    expect(outcomeOf({ head_branch: "main", event: "push", conclusion: "success" })).toBe("pass");
    expect(outcomeOf({ head_branch: "main", event: "workflow_dispatch", conclusion: "startup_failure" })).toBe("fail");
  });
  it("ignores branches, pull requests, merge queues, skipped and cancelled runs", () => {
    expect(outcomeOf({ head_branch: "feature", event: "push", conclusion: "failure" })).toBe("ignore");
    expect(outcomeOf({ head_branch: "main", event: "pull_request", conclusion: "failure" })).toBe("ignore");
    expect(outcomeOf({ head_branch: "main", event: "merge_group", conclusion: "failure" })).toBe("ignore");
    expect(outcomeOf({ head_branch: "main", event: "workflow_run", conclusion: "skipped" })).toBe("ignore");
    expect(outcomeOf({ head_branch: "main", event: "push", conclusion: "cancelled" })).toBe("ignore");
  });
  it("names the source by workflow file", () => {
    expect(sourceOf({ path: ".github/workflows/release.yml", name: "Cut and publish a release" })).toBe("release.yml");
  });
});

describe("plan", () => {
  it("opens an issue on the first failure and records the source", () => {
    const d = plan({ issue: null, ...failed });
    expect(d.action).toBe("create");
    expect(readState(d.body).failing["release.yml"]).toEqual({ url: "https://run/1", summary: "job `release` failure", since: now });
    expect(d.comment).toContain("boom");
  });
  it("updates the open issue on a repeat failure and keeps the first failure time", () => {
    const first = plan({ issue: null, ...failed });
    const d = plan({ issue: { number: 7, body: first.body }, ...failed, url: "https://run/2", now: "2026-11-18T00:00:00.000Z" });
    expect(d.action).toBe("update");
    expect(readState(d.body).failing["release.yml"]).toMatchObject({ url: "https://run/2", since: now });
  });
  it("does nothing on success when no issue is open or the source is not failing", () => {
    expect(plan({ issue: null, ...failed, outcome: "pass" }).action).toBe("none");
    const open = plan({ issue: null, ...failed });
    expect(plan({ issue: { number: 7, body: open.body }, ...failed, source: "data.yml", outcome: "pass" }).action).toBe("none");
    expect(plan({ issue: { number: 7, body: open.body }, ...failed, outcome: "ignore" }).action).toBe("none");
  });
  it("closes only when every failing source has succeeded again", () => {
    let body = plan({ issue: null, ...failed }).body;
    body = plan({ issue: { number: 7, body }, ...failed, source: "data.yml" }).body;
    const partial = plan({ issue: { number: 7, body }, ...failed, outcome: "pass" });
    expect(partial.action).toBe("update");
    expect(partial.comment).toContain("Still failing: `data.yml`");
    const done = plan({ issue: { number: 7, body: partial.body }, ...failed, source: "data.yml", outcome: "pass" });
    expect(done.action).toBe("close");
    expect(readState(done.body).failing).toEqual({});
  });
  it("reads an issue without a state marker as having nothing failing", () => {
    expect(readState("written by hand")).toEqual({ failing: {} });
    expect(readState(null)).toEqual({ failing: {} });
  });
});

describe("logExcerpt", () => {
  it("keeps the lines before the first error, without timestamps or group markers", () => {
    const log = [
      "2026-11-16T03:06:50.3868993Z ##[group]Run npm ci",
      "2026-11-16T03:06:50.3868993Z ##[endgroup]",
      ...Array.from({ length: 60 }, (_, i) => `2026-11-16T03:06:50.3868993Z line ${i}`),
      "2026-11-16T03:20:26.8130811Z Knowledge-graph build failed: claims do not match",
      "2026-11-16T03:20:45.9142997Z ##[error]Process completed with exit code 1.",
      "2026-11-16T03:20:46.0000000Z Cleaning up orphan processes",
    ].join("\n");
    const text = logExcerpt(log, 5);
    expect(text.split("\n")).toEqual(["line 57", "line 58", "line 59", "Knowledge-graph build failed: claims do not match", "##[error]Process completed with exit code 1."]);
  });
  it("falls back to the end of the log and cannot break out of the code block", () => {
    expect(logExcerpt("a\nb\n```\nc", 2)).toBe("'''\nc");
  });
  it("drops terminal colour codes", () => {
    expect(logExcerpt("\u001b[36;1mecho hi\u001b[0m")).toBe("echo hi");
  });
  it("caps the excerpt length", () => {
    expect(logExcerpt("x".repeat(10_000)).length).toBeLessThanOrEqual(6004);
  });
});

describe("staleness", () => {
  const releases = [
    { tagName: "kg/2026-11-16-b", publishedAt: "2026-11-16T03:00:00Z" },
    { tagName: "serving/2026-11-16-b", publishedAt: "2026-11-16T03:00:00Z" },
    { tagName: "serving/2026-11-02-a", publishedAt: "2026-11-02T12:00:00Z" },
  ];
  it("is stale when the live release lags the newest serving release by over a day", () => {
    expect(staleness({ liveId: "2026-11-02-a", releases, now })).toMatchObject({ stale: true, newest: "2026-11-16-b" });
  });
  it("allows a day for adoption and deploy", () => {
    expect(staleness({ liveId: "2026-11-02-a", releases, now: "2026-11-16T20:00:00Z" }).stale).toBe(false);
  });
  it("is not stale when the site serves the newest release", () => {
    expect(staleness({ liveId: "2026-11-16-b", releases, now }).stale).toBe(false);
  });
  it("fails loudly when there is no serving release", () => {
    expect(() => staleness({ liveId: "x", releases: [], now })).toThrow(/No published serving/);
  });
});

describe("alert workflow", () => {
  // workflow_run matches workflows by their name, not their file, so a rename would silently stop alerts.
  const alert = readFileSync(".github/workflows/pipeline-alert.yml", "utf8");
  const listed = [...alert.matchAll(/^\s+- "([^"]+)"\s*$/gm)].map((m) => m[1]);
  const nameOf = (file: string) => /^name:\s*(.+)$/m.exec(readFileSync(`.github/workflows/${file}`, "utf8"))?.[1].trim().replace(/^["']|["']$/g, "");
  it.each(WATCHED)("listens to %s by its current name", (file) => {
    expect(readdirSync(".github/workflows")).toContain(file);
    expect(listed).toContain(nameOf(file));
  });
  it("lists no other workflow", () => {
    expect(listed.sort()).toEqual(WATCHED.map(nameOf).sort());
  });
});
