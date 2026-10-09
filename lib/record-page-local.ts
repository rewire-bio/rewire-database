import { buildCatalogue } from "./catalogue-build";
import { buildUseCases } from "./use-cases-build";
import { recordPageBuilder, type RecordPageKind } from "../lib/record-pages";

let cached: { query: ReturnType<typeof buildCatalogue>["query"]; build: ReturnType<typeof recordPageBuilder> } | undefined;

/** Builds a result or evaluation page from the prepared release file.
 * The same builder serves production, tests and the local page API. */
export function localRecordPage(kind: RecordPageKind, id: string) {
  const { query } = buildCatalogue();
  if (cached?.query !== query) cached = { query, build: recordPageBuilder(query, buildUseCases().query) };
  return cached.build(kind, id);
}
