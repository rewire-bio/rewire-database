import fs from "node:fs";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { parseCatalogue } from "./omics";

/** Static rendering uses the API's exact query engine against a reviewed snapshot.
 * Production browsers query the same contract over tRPC and pin this release.
 * Builds remain independent of live credentials and do not scan Firestore.
 */
let cached:
  | {
      mtime: number;
      catalogue: ReturnType<typeof parseCatalogue>;
      query: ReturnType<typeof createCatalogueQuery>;
    }
  | undefined;
export function buildCatalogue() {
  const file = "public/omics/catalogue.json";
  const mtime = fs.statSync(file).mtimeMs;
  if (!cached || cached.mtime !== mtime) {
    const catalogue = parseCatalogue(JSON.parse(fs.readFileSync(file, "utf8")));
    cached = { mtime, catalogue, query: createCatalogueQuery(catalogue) };
  }
  return cached;
}
