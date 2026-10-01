import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { adoptRefresh, lastCompletedSweep, parseRefresh, publicationFeed, reviewOverdue, type RefreshData } from "../lib/refresh";
import { readRefresh } from "../lib/refresh-build";
import RefreshStatus from "../components/RefreshStatus";

const release = "2026-09-30-aaaaaaaaaaaa";
const manifest = JSON.stringify({ release_id: release, released_at: "2026-09-30T11:00:00Z" });
const manifestHash = createHash("sha256").update(manifest).digest("hex");
function fixture(): RefreshData {
  return {
    schema_version: "1.0", generated_at: "2026-10-01T10:00:00Z",
    schedule: { status: "active", timezone: "Europe/London", description: "First day of each month at 09:00 Europe/London.", next_due_at: "2026-11-01T09:00:00Z", maintainer: null },
    runs: [{ id: "october-1", cycle_id: "2026-10", attempt: 1, status: "completed", started_at: "2026-10-01T08:00:00Z", finished_at: "2026-10-01T09:00:00Z", baseline_release_id: release, outcome: "no_change", coverage: { target_ids: ["genomics", "use-cases"], checked_ids: ["genomics", "use-cases"], gaps: ["Human scientific review remains unassigned."] }, counts: { added: 0, revised: 0, excluded: 2, blocked: 0 }, report_url: null, pr_url: null }],
    updates: [{ release_id: release, manifest_sha256: manifestHash, commit: "b".repeat(40), published_at: "2026-09-30T12:00:00Z", time_basis: "observed", maintenance_run_id: null, summary: ["Added source evidence & clarified <coverage>."], links: [{ label: "Evidence", url: "/evidence/" }], receipt_url: "https://benchmarks.rewirebio.io/deployment.json" }],
  };
}

const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function directory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refresh-reader-"));
  temporary.push(root);
  fs.mkdirSync(path.join(root, "public/omics"), { recursive: true });
  return root;
}

describe("public refresh contract", () => {
  it("preserves a no-change sweep without creating a publication", () => {
    const data = fixture(); data.updates = [];
    expect(parseRefresh(data).runs[0].outcome).toBe("no_change");
    expect(lastCompletedSweep(data)?.finished_at).toBe("2026-10-01T09:00:00Z");
    expect(publicationFeed(data)).not.toContain("<entry>");
    const html = renderToStaticMarkup(<RefreshStatus data={data} />);
    expect(html).toContain("No candidate catalogue changes found in this sweep.");
    expect(html).toContain("Publication receipt not recorded");
    expect(html).toContain("does not mean every record was reverified");
    expect(html).toContain("Human scientific review remains unassigned.");
  });

  it("retains last completed sweep when a newer attempt fails or remains partial", () => {
    const data = fixture();
    data.runs.push({ ...data.runs[0], id: "november-1", cycle_id: "2026-11", status: "blocked", started_at: "2026-11-01T09:00:00Z", finished_at: "2026-11-01T10:00:00Z", outcome: null, coverage: { target_ids: ["genomics", "use-cases"], checked_ids: ["genomics"], gaps: ["Use-case sources inaccessible."] } });
    expect(parseRefresh(data)).toBeDefined();
    expect(lastCompletedSweep(data)?.id).toBe("october-1");
    const html = renderToStaticMarkup(<RefreshStatus data={data} />);
    expect(html).toContain("Latest attempt: blocked");
    expect(html).toContain("does not advance the completed sweep date");
  });

  it("calculates overdue state using the current clock without a rebuild", () => {
    const data = fixture();
    expect(reviewOverdue(data, Date.parse("2026-11-01T08:59:00Z"))).toBe(false);
    expect(reviewOverdue(data, Date.parse("2026-11-01T09:01:00Z"))).toBe(true);
    data.schedule.status = "paused";
    expect(reviewOverdue(data, Date.parse("2026-11-02T09:01:00Z"))).toBe(false);
    data.schedule.status = "active";
    data.runs[0].finished_at = "2026-11-05T10:00:00Z";
    expect(reviewOverdue(data, Date.parse("2026-11-06T09:01:00Z"))).toBe(true);
  });

  it("does not count a targeted correction as a monthly sweep", () => {
    const data = fixture();
    data.runs.push({ ...data.runs[0], id: "correction-run", cycle_id: "correction-2026-11-01-source", started_at: "2026-11-01T10:00:00Z", finished_at: "2026-11-01T11:00:00Z" });
    expect(lastCompletedSweep(data)?.id).toBe("october-1");
    expect(reviewOverdue(data, Date.parse("2026-11-01T12:00:00Z"))).toBe(true);
  });

  it("updates an already mounted status after the due time passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T08:59:30Z"));
    vi.stubGlobal("window", { setInterval, clearInterval });
    let component: ReturnType<typeof create> | undefined;
    try {
      act(() => { component = create(<RefreshStatus data={fixture()} />); });
      expect(JSON.stringify(component!.toJSON())).not.toContain("review is overdue");
      act(() => { vi.advanceTimersByTime(60_000); });
      expect(JSON.stringify(component!.toJSON())).toContain("review is overdue");
    } finally {
      act(() => component?.unmount());
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("rejects malformed, unsafe and inconsistent metadata", () => {
    const cases = [
      (data: RefreshData) => { data.generated_at = "not-a-date"; },
      (data: RefreshData) => { data.runs[0].counts.added = -1; },
      (data: RefreshData) => { data.runs[0].finished_at = null; },
      (data: RefreshData) => { data.runs[0].coverage.checked_ids = ["outside-scope"]; },
      (data: RefreshData) => { data.updates[0].receipt_url = "javascript:alert(1)"; },
      (data: RefreshData) => { data.updates[0].links[0].url = "//untrusted.example"; },
      (data: RefreshData) => { data.runs.push(structuredClone(data.runs[0])); },
      (data: RefreshData) => { data.updates[0].maintenance_run_id = "unknown-run"; },
    ];
    for (const change of cases) { const data = fixture(); change(data); expect(() => parseRefresh(data)).toThrow(); }
  });

  it("filters unadopted publications and rejects a mismatched current manifest", () => {
    const data = fixture();
    data.updates.push({ ...data.updates[0], release_id: "2026-10-02-cccccccccccc", commit: "c".repeat(40) });
    expect(adoptRefresh(data, release, manifestHash).updates).toHaveLength(1);
    expect(() => adoptRefresh(data, release, "f".repeat(64))).toThrow(/manifest/);
  });

  it("retains verified earlier publications in history and feed across adoption", () => {
    const data = fixture();
    const older = "2026-09-29-cccccccccccc";
    data.updates.push({ ...data.updates[0], release_id: older, manifest_sha256: "d".repeat(64), commit: "c".repeat(40), published_at: "2026-09-29T12:00:00Z" });
    const adopted = adoptRefresh(data, release, manifestHash, { [older]: "d".repeat(64) });
    expect(adopted.updates.map((entry) => entry.release_id)).toEqual([release, older]);
    expect(publicationFeed(adopted)).toContain(older);
    expect(() => adoptRefresh(data, release, manifestHash, { [older]: "f".repeat(64) })).toThrow(/archived release manifest/);
    expect(adoptRefresh(data, release, manifestHash).updates).toHaveLength(1);
    const future = "2026-10-02-cccccccccccc";
    data.updates.push({ ...data.updates[0], release_id: future, commit: "e".repeat(40) });
    expect(adoptRefresh(data, release, manifestHash, { [older]: "d".repeat(64) }).updates).toHaveLength(2);
  });

  it("serves publication entries only and escapes Atom XML", () => {
    const data = adoptRefresh(fixture(), release, manifestHash);
    const feed = publicationFeed(data);
    expect(feed).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(feed).toContain("&amp; clarified &lt;coverage&gt;");
    expect(feed).not.toContain("october-1");
    expect(feed).toContain("2026-09-30T12:00:00Z");
    expect(renderToStaticMarkup(<RefreshStatus data={data} />)).toContain("Verified published at");
  });

  it("uses an honest legacy fallback only when the file is absent", () => {
    const root = directory();
    expect(readRefresh(root)).toBeNull();
    expect(renderToStaticMarkup(<RefreshStatus data={null} />)).toContain("Schedule not recorded");
    fs.writeFileSync(path.join(root, "public/omics/refresh.json"), "broken JSON");
    expect(() => readRefresh(root)).toThrow();
  });

  it("binds persisted metadata to hydrated manifest bytes and catalogue identity", () => {
    const root = directory();
    fs.writeFileSync(path.join(root, "public/omics/refresh.json"), JSON.stringify(fixture()));
    fs.writeFileSync(path.join(root, "public/omics/manifest.json"), manifest);
    expect(readRefresh(root, release)?.updates).toHaveLength(1);
    expect(() => readRefresh(root, "2026-10-01-ffffffffffff")).toThrow(/different catalogue/);
    fs.writeFileSync(path.join(root, "public/omics/manifest.json"), manifest + "\n");
    expect(() => readRefresh(root, release)).toThrow(/manifest/);
  });

  it("loads historical receipt hashes and omits missing archives without hiding corruption", () => {
    const root = directory();
    const older = "2026-09-29-cccccccccccc";
    const oldManifest = JSON.stringify({ release_id: older, released_at: "2026-09-29T11:00:00Z" });
    const data = fixture();
    data.updates.push({ ...data.updates[0], release_id: older, manifest_sha256: createHash("sha256").update(oldManifest).digest("hex"), commit: "c".repeat(40), published_at: "2026-09-29T12:00:00Z" });
    fs.writeFileSync(path.join(root, "public/omics/refresh.json"), JSON.stringify(data));
    fs.writeFileSync(path.join(root, "public/omics/manifest.json"), manifest);
    expect(readRefresh(root, release)?.updates).toHaveLength(1);
    fs.mkdirSync(path.join(root, "data/omics/releases"), { recursive: true });
    const archive = path.join(root, "data/omics/releases", `${older}.json`);
    fs.writeFileSync(archive, oldManifest);
    expect(readRefresh(root, release)?.updates).toHaveLength(2);
    fs.writeFileSync(archive, oldManifest + "\n");
    expect(() => readRefresh(root, release)).toThrow(/archived release manifest/);
    fs.writeFileSync(archive, manifest);
    expect(() => readRefresh(root, release)).toThrow(/different release identity/);
  });

  it("orders same-day archives by receipt time rather than their hash suffix", () => {
    const root = directory();
    const older = "2026-09-30-ffffffffffff"; // Lexically higher, chronologically earlier.
    const future = "2026-09-30-000000000000"; // Lexically lower, chronologically later.
    const data = fixture();
    fs.mkdirSync(path.join(root, "data/omics/releases"), { recursive: true });
    for (const [id, time] of [[older, "2026-09-30T10:00:00Z"], [future, "2026-09-30T13:00:00Z"]]) {
      const bytes = JSON.stringify({ release_id: id, released_at: time });
      fs.writeFileSync(path.join(root, "data/omics/releases", `${id}.json`), bytes);
      data.updates.push({ ...data.updates[0], release_id: id, published_at: time, manifest_sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    fs.writeFileSync(path.join(root, "public/omics/refresh.json"), JSON.stringify(data));
    fs.writeFileSync(path.join(root, "public/omics/manifest.json"), manifest);
    const adopted = readRefresh(root, release)!;
    expect(adopted.updates.map((entry) => entry.release_id)).toEqual([release, older]);
    expect(publicationFeed(adopted)).toContain(older);
    expect(publicationFeed(adopted)).not.toContain(future);
  });
});
