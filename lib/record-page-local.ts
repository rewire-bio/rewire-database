import { buildCatalogue } from "./catalogue-build";
import { buildUseCases } from "./use-cases-build";
import { recordPageBuilder, type RecordPageKind } from "../services/omics/src/record-pages";

let cached: { query: ReturnType<typeof buildCatalogue>["query"]; build: ReturnType<typeof recordPageBuilder> } | undefined;

/** Builds a page from the hydrated local release with the importer's builder.
 * For tests and the local page API only; production reads the stored page. */
export function localRecordPage(kind: RecordPageKind, id: string) {
  const { query } = buildCatalogue();
  if (cached?.query !== query) cached = { query, build: recordPageBuilder(query, buildUseCases().query) };
  return cached.build(kind, id);
}
