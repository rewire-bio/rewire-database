import fs from "node:fs";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { parseCatalogue } from "./omics";
import { dataPath, dataPin } from "./data-pin";

/** Low-volume pages render with the API's exact query engine against the
 * pinned release, read once per server instance from its verified local copy.
 * Result and evaluation pages never call this; they read bounded page documents.
 */
let cached:
  | {
      mtime: number;
      catalogue: ReturnType<typeof parseCatalogue>;
      query: ReturnType<typeof createCatalogueQuery>;
    }
  | undefined;
export function buildCatalogue() {
  const file = dataPath("public/omics/catalogue.json");
  const mtime = fs.statSync(file).mtimeMs;
  if (!cached || cached.mtime !== mtime) {
    const catalogue = parseCatalogue(JSON.parse(fs.readFileSync(file, "utf8")));
    if (catalogue.release_id !== dataPin().release_id)
      throw new Error("Local catalogue differs from the pinned release");
    cached = { mtime, catalogue, query: createCatalogueQuery(catalogue) };
  }
  return cached;
}
