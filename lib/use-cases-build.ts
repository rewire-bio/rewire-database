import { buildCatalogue } from "./catalogue-build";
import type { UseCaseDetail, UseCaseQuery, ResolvedMapping } from "../shared/omics/use-cases";

let cached: { query: ReturnType<typeof buildCatalogue>["query"]; value: { query: UseCaseQuery; entries: ReturnType<UseCaseQuery["list"]>["items"] } } | undefined;

/** The release's use cases, resolved and validated by the producer and read from the prepared file. */
export function buildUseCases() {
  const { query: catalogue } = buildCatalogue();
  if (cached?.query !== catalogue) {
    const query = catalogue.useCases();
    const entries: ReturnType<UseCaseQuery["list"]>["items"] = [];
    let cursor: string | undefined;
    do {
      const page = query.list({ limit: 100, ...(cursor ? { cursor } : {}) });
      entries.push(...page.items);
      cursor = page.next_cursor || undefined;
    } while (cursor);
    cached = { query: catalogue, value: { query, entries } };
  }
  return cached.value;
}

/** Pure accumulation over any UseCaseQuery, with no filesystem dependency so
 * it is directly testable against a synthetic query. query.get()/
 * evaluationResults() return evaluation objects straight out of the query's
 * own cache (the same bounded preview is handed to every caller, including a
 * future direct call to query.get()). Cloning each evaluation and its results
 * array before appending to it is required: pushing onto the cached array in
 * place would both corrupt the bounded preview for any later caller and, since
 * buildUseCases() memoizes `query` for the process, grow without bound across
 * repeated calls to this function for the same slug. */
export function accumulateUseCaseDetail(query: UseCaseQuery, slug: string): UseCaseDetail | null {
  const clone = (e: ResolvedMapping["evaluations"][number]) => ({ ...e, results: [...e.results] });
  const first = query.get({ slug, limit: 100 });
  if (!first) return null;
  const mappings = new Map<string, ResolvedMapping>(
    first.mappings.map((m) => [m.id, { ...m, evaluations: m.evaluations.map(clone) }]),
  );
  let cursor = first.evaluations_next_cursor;
  while (cursor) {
    const page = query.get({ slug, cursor, limit: 100 })!;
    for (const m of page.mappings) if (m.evaluations.length) mappings.get(m.id)!.evaluations.push(...m.evaluations.map(clone));
    cursor = page.evaluations_next_cursor;
  }
  for (const mapping of mappings.values()) for (const evaluation of mapping.evaluations) {
    let resultsCursor = evaluation.results_next_cursor;
    while (resultsCursor) {
      const page = query.evaluationResults({ mapping_id: mapping.id, evaluation_id: evaluation.evaluation.id, cursor: resultsCursor, limit: 100 });
      evaluation.results.push(...page.items);
      resultsCursor = page.next_cursor;
    }
    evaluation.results_next_cursor = null;
  }
  return { ...first, mappings: [...mappings.values()] };
}

/** The static site has no HTTP response budget, so it accumulates every
 * evaluation and result page the live API otherwise paginates, giving each
 * generated use-case page the complete reviewed evidence in one call chain. */
export function fullUseCaseDetail(slug: string): UseCaseDetail | null {
  const { query } = buildUseCases();
  return accumulateUseCaseDetail(query, slug);
}
