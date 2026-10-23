/** Evidence concerns: problems a reviewer found that should stop evidence supporting comparisons
 * and use-case judgements.
 *
 * Each concern is an entry in a source record's `attributes.evidence_concerns`. An entry without
 * `applies_to` covers everything the source supports: any record citing the source is withheld.
 * An entry with `applies_to: [ids]` covers only those records and the evidence that rests on them,
 * so a source cited for context, or a paper that reports a problem in someone else's benchmark,
 * does not withhold evidence it never supported. A named result, evaluation, tested configuration,
 * dataset, the protocol, task or benchmark the evaluation was tested on, or what that is directly
 * part_of, withholds every result on that path, from any source; a named claim withholds that claim.
 * scripts/kg/contradictions.py (_excluded) applies the same rules to discrepancy inference. */
import type { CatalogueRecord } from "./catalogue-query.js";

export const concernTargetKinds = [
  "result", "evaluation", "configuration", "dataset", "dataset_subset", "protocol", "task", "benchmark", "claim",
] as const;

/** A source's concern entries. A plain-text entry, the form older records use, is a concern
 * over the whole source, as it always was. */
function entries(record: CatalogueRecord | undefined): Record<string, unknown>[] {
  const value = record?.attributes.evidence_concerns;
  if (!Array.isArray(value)) return [];
  return value.flatMap((e): Record<string, unknown>[] =>
    typeof e === "string" ? (e.trim() ? [{ message: e }] : []) : e && typeof e === "object" ? [e as Record<string, unknown>] : []);
}

function scope(entry: Record<string, unknown>): string[] | undefined {
  return Array.isArray(entry.applies_to) && entry.applies_to.length ? entry.applies_to.map(String) : undefined;
}

/** Whether the source carries a concern over everything it supports. */
export function sourceWideConcern(source: CatalogueRecord | undefined): boolean {
  return entries(source).some((e) => !scope(e));
}

/** IDs named by scoped concerns on any source. */
export function concernTargets(records: Iterable<CatalogueRecord>): Set<string> {
  const ids = new Set<string>();
  for (const r of records) if (r.kind === "source") for (const e of entries(r)) for (const id of scope(e) || []) ids.add(id);
  return ids;
}

const memo = new WeakMap<object, Set<string>>();
/** concernTargets over a record map, computed once per map. */
export function concernTargetsOf(byId: Map<string, CatalogueRecord>): Set<string> {
  let ids = memo.get(byId);
  if (!ids) memo.set(byId, (ids = concernTargets(byId.values())));
  return ids;
}

/** The IDs a result's value rests on: the result, its evaluation, the evaluation's tested system,
 * dataset and assessments (protocols, tasks or benchmarks), and what those are directly part of. */
export function evidencePath(
  result: CatalogueRecord | undefined, evaluation: CatalogueRecord | null | undefined, assessments: (CatalogueRecord | undefined)[],
): string[] {
  return [
    ...(result ? [result.id] : []),
    ...(evaluation ? [evaluation.id, ...evaluation.links.filter((l) => ["system", "assessment", "data"].includes(l.relation)).map((l) => l.target_id)] : []),
    ...assessments.flatMap((a) => (a ? a.links.filter((l) => l.relation === "part_of").map((l) => l.target_id) : [])),
  ];
}

/** Reject scoped concerns that are not on a source or name records that do not exist. */
export function validateConcerns(records: CatalogueRecord[]): void {
  const byId = new Map(records.map((r) => [r.id, r]));
  const problems: string[] = [];
  for (const r of records)
    for (const e of entries(r)) {
      if (e.applies_to === undefined) continue;
      if (r.kind !== "source") problems.push(`${r.id}: evidence_concerns belong on a source record`);
      if (!Array.isArray(e.applies_to) || !e.applies_to.length || e.applies_to.some((id) => typeof id !== "string"))
        problems.push(`${r.id}: applies_to must be a non-empty list of record IDs`);
      else for (const id of e.applies_to as string[]) {
        const target = byId.get(id);
        if (!target) problems.push(`${r.id}: applies_to names ${id}, which does not exist`);
        else if (!(concernTargetKinds as readonly string[]).includes(target.kind))
          problems.push(`${r.id}: applies_to names ${target.kind} ${id}; a concern can name ${concernTargetKinds.join(", ")}`);
      }
    }
  if (problems.length) throw new Error(`Invalid evidence concerns:\n  ${problems.slice(0, 20).join("\n  ")}`);
}
