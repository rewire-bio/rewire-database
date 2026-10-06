import fs from "node:fs";

/** Only the cache orchestrator supplies this file. Ordinary builds render all ids. */
export function filterCachedDetailIds(kind: string, ids: string[]): string[] {
  const file = process.env.DETAIL_CACHE_SKIP_FILE;
  if (process.env.DETAIL_CACHE !== "1" || !file) return ids;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.epoch !== process.env.DETAIL_CACHE_EPOCH)
    throw new Error("Detail cache skip list has a different renderer epoch");
  const skipped = new Set<string>(manifest.ids[kind] || []);
  return ids.filter((id) => !skipped.has(id));
}
