import fs from "node:fs";
import { createHash } from "node:crypto";
import type { RecordEntry } from "./schema";
const root = "data/omics/reviewed/run-recipes";
export const runRecipeInputs = [
  `${root}/records.jsonl`,
  `${root}/overlays.json`,
  `${root}/review.json`,
];
/** Additive, reviewed recipe metadata; never mutate scientific values or associations. */
export function addRunRecipes(input: RecordEntry[]): RecordEntry[] {
  const review = JSON.parse(fs.readFileSync(runRecipeInputs[2], "utf8"));
  if (review.status !== "reviewed" || !review.method || !review.date)
    throw new Error("Missing recipe review");
  for (const file of runRecipeInputs.slice(0, 2))
    if (
      createHash("sha256").update(fs.readFileSync(file)).digest("hex") !==
      review.files[file]
    )
      throw new Error(`Recipe input changed since review: ${file}`);
  const added = fs
    .readFileSync(runRecipeInputs[0], "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const records = new Map(input.map((r) => [r.id, r]));
  for (const record of added) {
    if (records.has(record.id))
      throw new Error("Recipe additions cannot replace existing records");
    if (!["source", "protocol", "claim"].includes(record.kind))
      throw new Error("Recipe additions cannot add scientific results");
    records.set(record.id, record);
  }
  const seen = new Set();
  for (const overlay of JSON.parse(
    fs.readFileSync(runRecipeInputs[1], "utf8"),
  )) {
    if (
      Object.keys(overlay).some(
        (key) =>
          !["id", "source_ids", "run_recipes", "reproduction"].includes(key),
      )
    )
      throw new Error("Recipe overlays may not alter scientific records");
    const original = records.get(overlay.id);
    if (!original || seen.has(overlay.id))
      throw new Error("Invalid or repeated recipe overlay");
    seen.add(overlay.id);
    const attributes = { ...original.attributes };
    for (const field of ["run_recipes", "reproduction"])
      if (overlay[field] !== undefined) attributes[field] = overlay[field];
    records.set(original.id, {
      ...original,
      source_ids: [
        ...new Set([...original.source_ids, ...(overlay.source_ids || [])]),
      ],
      attributes,
    });
  }
  return [...records.values()];
}
