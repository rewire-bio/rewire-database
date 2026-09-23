/** Read-only audit: npx tsx scripts/seo/audit-record-metadata.ts [catalogue.json] */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCatalogue, recordHref, type OmicsRecord } from "../../lib/omics";
import { catalogueText } from "../../lib/catalogue-text";
import {
  recordSearchMetadata,
  recordIsIndexable,
} from "../../lib/catalogue-seo";

const bytes = readFileSync(process.argv[2] || "public/omics/catalogue.json");
const catalogue = parseCatalogue(JSON.parse(bytes.toString()));
const previous = (record: OmicsRecord) => ({
  title: catalogueText(record.name),
  description: catalogueText(
    (record.attributes.profile as { summary?: string } | undefined)?.summary ||
      record.description,
  ),
});
const rows = catalogue.records.map((record) => ({
  record,
  before: previous(record),
  after: recordSearchMetadata(record, catalogue.records),
}));
function duplicateMembers(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.values()]
    .filter((count) => count > 1)
    .reduce((a, b) => a + b, 0);
}
const groups = new Map<string, OmicsRecord[]>();
for (const record of catalogue.records.filter(
  (record) => record.kind === "model",
)) {
  const group = groups.get(record.name) || [];
  group.push(record);
  groups.set(record.name, group);
}
const report = {
  release_id: catalogue.release_id,
  catalogue_sha256: createHash("sha256").update(bytes).digest("hex"),
  scope:
    "Computed metadata for every non-excluded record; no scientific records changed. This does not measure Google indexing or search performance. Duplicate counts include every member of a same-kind group, including empty descriptions.",
  by_kind: [...new Set(catalogue.records.map((record) => record.kind))]
    .sort()
    .map((kind) => {
      const selected = rows.filter((row) => row.record.kind === kind);
      const stats = (key: "before" | "after") => ({
        missing_descriptions: selected.filter(
          (row) => !row[key].description.trim(),
        ).length,
        repeated_descriptions: duplicateMembers(
          selected.map((row) => row[key].description),
        ),
        repeated_titles: duplicateMembers(
          selected.map((row) => row[key].title),
        ),
      });
      return {
        kind,
        records: selected.length,
        indexable: selected.filter((row) => recordIsIndexable(row.record))
          .length,
        before: stats("before"),
        after: stats("after"),
      };
    }),
  samples: [...new Set(catalogue.records.map((record) => record.kind))]
    .sort()
    .flatMap((kind) => {
      const selected = rows.filter((row) => row.record.kind === kind);
      return [
        ...new Set([
          selected[0],
          selected.find((row) => !row.before.description),
        ]),
      ]
        .filter((row) => row !== undefined)
        .map(({ record, before, after }) => ({
          id: record.id,
          kind,
          path: recordHref(record),
          before,
          after,
        }));
    }),
  same_name_models: [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      name: group[0].name,
      decision:
        "Retain separate IDs and self-canonicals; source/version/relationship evidence does not authorize a scientific record merge in this presentation change.",
      records: group.map((record) => ({
        id: record.id,
        version: record.attributes.version ?? null,
        checkpoint: record.attributes.checkpoint ?? null,
        source_ids: record.source_ids,
        links: record.links,
        metadata: recordSearchMetadata(record, catalogue.records),
      })),
    })),
};
console.log(JSON.stringify(report, null, 2));
