import { preparedCatalogue } from "./prepared";

/** Pages read the pinned release's prepared file: bounded lookups per request,
 * no catalogue-wide parsing or index building. */
export function buildCatalogue() {
  const query = preparedCatalogue();
  const release = query.release();
  return {
    catalogue: {
      release_id: release.release_id,
      released_at: release.released_at,
      schema_version: release.schema_version,
      coverage: release.coverage,
    },
    query,
  };
}
export type PreparedQuery = ReturnType<typeof buildCatalogue>["query"];
