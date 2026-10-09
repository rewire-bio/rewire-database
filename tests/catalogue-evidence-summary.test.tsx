import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogueRecord, CatalogueSnapshot } from "../shared/omics/catalogue-query";

const coverage = vi.hoisted(() => ({ calls: 0 }));
vi.mock("../scripts/omics/audit-benchmark-evidence", async (original) => {
  const actual = await original<typeof import("../scripts/omics/audit-benchmark-evidence")>();
  return { ...actual, benchmarkCoverage: (...args: Parameters<typeof actual.benchmarkCoverage>) => { coverage.calls++; return actual.benchmarkCoverage(...args); } };
});
import { CatalogueEvidence, catalogueEvidenceSummary } from "../components/catalogue/CatalogueEvidence";
import { benchmarkCoverage } from "../scripts/omics/audit-benchmark-evidence";
import { preparedFromSnapshot } from "./helpers/prepared";

const record = (id: string, kind: CatalogueRecord["kind"], extra: Partial<CatalogueRecord> = {}): CatalogueRecord => ({
  id, kind, name: id, description: "Synthetic evidence", status: "source_checked", source_ids: [], links: [], facets: { areas: ["dna-genomes"] }, attributes: {}, ...extra,
});
function catalogue(extra: CatalogueRecord[] = []): CatalogueSnapshot {
  const records = [
    record("benchmark", "benchmark"), record("covered", "benchmark"),
    record("evaluation", "evaluation", { links: [{ relation: "benchmark", target_id: "covered" }] }),
    record("published", "result", { links: [{ relation: "evaluation", target_id: "evaluation" }] }),
    record("reproduced", "result", { status: "reproduced" }), ...extra,
  ];
  return { schema_version: "1.1", release_id: "fixture", released_at: "2026-10-01T00:00:00Z", coverage: {}, records };
}

describe("catalogue evidence summary", () => {
  it("reads the stored summary once per release handle and renders identically on every request", () => {
    const pinned = preparedFromSnapshot(catalogue());
    coverage.calls = 0;
    const first = renderToStaticMarkup(<CatalogueEvidence query={pinned} />);
    const repeated = Array.from({ length: 3 }, () => renderToStaticMarkup(<CatalogueEvidence query={pinned} />));
    expect(coverage.calls).toBe(1);
    expect(repeated).toEqual([first, first, first]);
    expect(catalogueEvidenceSummary(pinned)).toBe(catalogueEvidenceSummary(pinned));
  });
  it("matches a direct computation over the same records", () => {
    const snapshot = catalogue();
    const expected = benchmarkCoverage(snapshot.records);
    const summary = catalogueEvidenceSummary(preparedFromSnapshot(snapshot));
    expect(summary.coverageRows).toEqual(expected.map((entry) => ({ label: entry.name, value: entry.evaluations, muted: entry.evaluations === 0 })));
    expect(summary.covered).toBe(expected.filter((entry) => entry.evaluations > 0).length);
    expect(summary).toMatchObject({ records: 5, external: 1, own: 1, benchmarks: 2 });
  });
  it("uses each release's own summary rather than serving an earlier release's", () => {
    const before = preparedFromSnapshot(catalogue());
    const after = preparedFromSnapshot(catalogue([record("new-benchmark", "benchmark"), record("new-result", "result")]));
    coverage.calls = 0;
    const old = renderToStaticMarkup(<CatalogueEvidence query={before} />);
    const changed = renderToStaticMarkup(<CatalogueEvidence query={after} />);
    expect(coverage.calls).toBe(2);
    expect(old).toContain("5 records across");
    expect(changed).toContain("7 records across");
    expect(changed).toContain("2 source-checked published results");
    expect(catalogueEvidenceSummary(after).benchmarks).toBe(3);
  });
});
