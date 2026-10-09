import { isBenchmarkSubject, isDatasetSubject } from "./entity-kinds.js";
import type { CatalogueRecord, ResultRow } from "./catalogue-query.js";

/** A curated figure reproduces one source table, not a cross-study ranking.
 * It references released results rather than copying their numerical values. */
export interface PublishedComparison {
  id: string;
  title: string;
  protocol_id: string;
  dataset_id: string;
  metric: string;
  unit: string;
  direction: "higher" | "lower";
  result_ids: string[];
  source_ids: string[];
  source_locator: string;
  context: string;
  caveats: string[];
  review: { method: "automated_source_review"; date: string };
}
export interface ResolvedComparison extends PublishedComparison {
  rows: ResultRow[];
  sources: CatalogueRecord[];
  protocol: CatalogueRecord;
  dataset: CatalogueRecord;
}

export function comparisonPanels(
  record: CatalogueRecord,
): PublishedComparison[] {
  const input = record.attributes.comparison_panels;
  if (input === undefined) return [];
  const fail = () => {
    throw new Error(`Invalid published comparison on ${record.id}`);
  };
  if (!isBenchmarkSubject(record.kind) || !Array.isArray(input)) return fail();
  const ids = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return fail();
    const p = raw as PublishedComparison;
    for (const key of [
      "id",
      "title",
      "protocol_id",
      "dataset_id",
      "metric",
      "unit",
      "source_locator",
      "context",
    ] as const)
      if (typeof p[key] !== "string" || !p[key].trim()) return fail();
    if (ids.has(p.id) || !["higher", "lower"].includes(p.direction))
      return fail();
    ids.add(p.id);
    for (const key of ["result_ids", "source_ids", "caveats"] as const)
      if (
        !Array.isArray(p[key]) ||
        !p[key].length ||
        p[key].some((v) => typeof v !== "string" || !v.trim())
      )
        return fail();
    if (
      new Set(p.result_ids).size !== p.result_ids.length ||
      p.result_ids.length < 2
    )
      return fail();
    if (
      p.review?.method !== "automated_source_review" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(p.review.date)
    )
      return fail();
  }
  return input as PublishedComparison[];
}

export function resolveComparisons(
  owner: CatalogueRecord,
  byId: Map<string, CatalogueRecord>,
  rowsById: Map<string, ResultRow>,
): ResolvedComparison[] {
  return comparisonPanels(owner).map((panel) => {
    const fail = (reason: string): never => {
      throw new Error(`Comparison ${panel.id}: ${reason}`);
    };
    const protocol = byId.get(panel.protocol_id);
    const dataset = byId.get(panel.dataset_id);
    if (
      !protocol ||
      !isBenchmarkSubject(protocol.kind) ||
      !dataset ||
      !isDatasetSubject(dataset.kind)
    )
      return fail("missing protocol or dataset");
    if (
      [protocol, dataset].some((record) =>
        ["superseded", "disputed", "excluded"].includes(record.status),
      )
    )
      return fail("inactive protocol or dataset");
    // Suite/task charts must have a reviewed path to their exact protocol.
    const ancestors = new Set([protocol.id]);
    const pending = [protocol];
    while (pending.length) {
      const current = pending.pop()!;
      for (const link of current.links) {
        if (
          !["part_of", "evaluates_task"].includes(link.relation) ||
          ancestors.has(link.target_id)
        )
          continue;
        const verified = [...byId.values()].some(
          (claim) =>
            claim.kind === "claim" &&
            ["source_checked", "reproduced"].includes(claim.status) &&
            claim.source_ids.length &&
            claim.attributes.source_locator &&
            claim.attributes.field ===
              `links:${link.relation}:${link.target_id}` &&
            claim.links.some(
              (l) => l.relation === "subject" && l.target_id === current.id,
            ),
        );
        const target = byId.get(link.target_id);
        if (verified && target && isBenchmarkSubject(target.kind)) {
          ancestors.add(target.id);
          pending.push(target);
        }
      }
    }
    if (!ancestors.has(owner.id))
      return fail("unverified protocol association");
    const sources = panel.source_ids.map((id) => {
      const source = byId.get(id);
      if (source?.kind !== "source") return fail("missing source");
      if (!/^[a-f0-9]{64}$/.test(String(source.attributes.artifact_sha256)))
        return fail("source artifact is not pinned");
      return source;
    });
    const rows = panel.result_ids.map((id) => {
      const row = rowsById.get(id);
      if (!row || !["source_checked", "reproduced"].includes(row.result.status))
        return fail("unchecked, superseded or missing result");
      const a = row.result.attributes;
      if (
        !row.evaluation ||
        ["superseded", "disputed", "excluded"].includes(row.evaluation.status)
      )
        return fail("inactive or missing evaluation");
      if (
        [...row.sources, ...sources].some(
          (source) =>
            Array.isArray(source.attributes.evidence_concerns) &&
            source.attributes.evidence_concerns.length,
        )
      )
        return fail("unresolved source concerns");
      if (
        a.numeric_value !== null &&
        (typeof a.numeric_value !== "string" ||
          !a.numeric_value.trim() ||
          !Number.isFinite(Number(a.numeric_value)))
      )
        return fail("non-numerical result");
      if (
        a.metric !== panel.metric ||
        a.unit !== panel.unit ||
        a.metric_direction !== panel.direction
      )
        return fail("mixed metric, unit or direction");
      if (
        !row.benchmarks.some((r) => r.id === protocol.id) ||
        !row.datasets.some((r) => r.id === dataset.id)
      )
        return fail("mixed protocol or dataset");
      if (
        !panel.source_ids.some((source) =>
          row.result.source_ids.includes(source),
        ) ||
        !a.source_locator
      )
        return fail("result lacks table provenance");
      return row;
    });
    // One published table can quote earlier experiments beside new ones. Keep
    // each row's origin visible; a shared table never makes them independent.
    if (
      new Set(
        rows
          .filter((row) => row.result.attributes.numeric_value !== null)
          .flatMap((row) => row.models.map((model) => model.id)),
      ).size < 2
    )
      return fail("fewer than two tested configurations");
    // Missing metadata is retained, not upgraded to the stronger compare() gate.
    for (const field of ["split", "subset", "population", "aggregation"]) {
      const values = rows.map((row) =>
        JSON.stringify(
          (
            row.evaluation?.attributes.comparison as
              | Record<string, unknown>
              | undefined
          )?.[field] ?? null,
        ),
      );
      if (new Set(values).size !== 1) return fail(`mixed ${field}`);
    }
    return { ...panel, rows, sources, protocol, dataset };
  });
}
