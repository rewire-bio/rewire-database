import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildCatalogue } from "./catalogue-build";
import { createUseCaseQuery, useCaseHash as hashUseCaseContent, validateUseCaseArtifact, type UseCaseDeclaration, type UseCaseDetail, type UseCaseQuery, type ResolvedMapping } from "../services/omics/src/use-cases";

function loadUseCases(catalogue: ReturnType<typeof buildCatalogue>["catalogue"], catalogueQuery: ReturnType<typeof buildCatalogue>["query"]) {
  if (!catalogue.coverage.use_cases) return {
    query: createUseCaseQuery(catalogue, undefined, undefined, catalogueQuery),
    artifact: undefined,
    entries: [],
  };
  const root = path.join("public/omics/releases", catalogue.release_id);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  if (manifest.release_id !== catalogue.release_id) throw new Error("Use-case manifest belongs to another release");
  const declaration = manifest.coverage?.use_cases as UseCaseDeclaration | undefined;
  const digest = manifest.files?.["use-cases.json"];
  if (Boolean(declaration) !== Boolean(digest)) throw new Error("Use-case declaration and artifact must be published together");
  if (!declaration || hashUseCaseContent(declaration) !== hashUseCaseContent(catalogue.coverage.use_cases)) throw new Error("Use-case manifest and catalogue declaration differ");
  const bytes = digest ? fs.readFileSync(path.join(root, "use-cases.json")) : undefined;
  if (bytes && createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error("Use-case artifact checksum mismatch");
  const artifact = bytes && declaration ? validateUseCaseArtifact(catalogue, JSON.parse(bytes.toString("utf8")), declaration) : undefined;
  const query = createUseCaseQuery(catalogue, artifact, declaration, catalogueQuery);
  return { query, artifact, entries: artifact?.use_cases || [] };
}

let cached: { catalogue: ReturnType<typeof buildCatalogue>["catalogue"]; value: ReturnType<typeof loadUseCases> } | undefined;

/** One validation and reverse index per immutable release, reused by all record pages. */
export function buildUseCases() {
  const { catalogue, query } = buildCatalogue();
  if (!cached || cached.catalogue !== catalogue) cached = { catalogue, value: loadUseCases(catalogue, query) };
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
