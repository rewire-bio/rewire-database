import { openPreparedCatalogue, type PreparedCatalogue } from "../shared/omics/prepared-catalogue";
import { dataPath, dataPin } from "./data-pin";
import { createUseCaseStore } from "./use-case-store";

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

// Loaded at runtime so bundlers never try to resolve the built-in.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
let useCases: { catalogue: PreparedCatalogue; query: ReturnType<typeof createUseCaseStore> } | undefined;

/** Use-case answers for `catalogue`. For the pinned release file they come from a
 * store that parses one use case at a time (lib/use-case-store.ts), instead of the
 * file reader's full parse of every use case's evidence. Other readers, such as
 * test fixtures, answer themselves. */
export function preparedUseCases(catalogue: PreparedCatalogue): ReturnType<PreparedCatalogue["useCases"]> {
  if (cached?.catalogue !== catalogue) return catalogue.useCases();
  if (useCases?.catalogue !== catalogue) {
    const db = new DatabaseSync(cached.file, { readOnly: true });
    try {
      const row = db.prepare("SELECT value FROM blobs WHERE key = ?").get("use_cases") as { value: Uint8Array } | undefined;
      if (!row) throw new Error("Prepared release lacks use_cases");
      useCases = { catalogue, query: createUseCaseStore(row.value) };
    } finally {
      db.close();
    }
  }
  return useCases.query;
}
