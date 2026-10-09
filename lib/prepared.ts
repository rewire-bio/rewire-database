import { openPreparedCatalogue, type PreparedCatalogue } from "../shared/omics/prepared-catalogue";
import { dataPath, dataPin } from "./data-pin";

/** The pinned release's prepared file: in the image under data/serving, or in a checkout under serving/. */
export function servingFile(): string {
  return dataPath("serving", `catalogue-${dataPin().release_id}.sqlite`);
}

let cached: { file: string; catalogue: PreparedCatalogue } | undefined;

/** One read-only handle per server process. Opening is cheap; reads are per request. */
export function preparedCatalogue(): PreparedCatalogue {
  const file = servingFile();
  if (cached?.file === file) return cached.catalogue;
  const catalogue = openPreparedCatalogue(file);
  if (catalogue.release_id !== dataPin().release_id)
    throw new Error(`Prepared release ${catalogue.release_id} differs from the data pin ${dataPin().release_id}`);
  cached = { file, catalogue };
  return catalogue;
}
