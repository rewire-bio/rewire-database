import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  entityKinds,
  type EntityKind,
  isBenchmarkSubject,
} from "../../services/omics/src/entity-kinds";
import { publicRecords, type RecordEntry } from "./schema";
const root = "data/omics/reviewed/entity-separation";
export const entityInputFiles = [
  `${root}/classification.json`,
  `${root}/run-guides.json`,
  `${root}/sources.jsonl`,
  `${root}/run-audit.jsonl`,
  `${root}/review.json`,
  `${root}/profile-corrections.json`,
  `${root}/classification-review.json`,
  `${root}/run-review.json`,
  `${root}/receipts.json`,
];
export function separateEntities(input: RecordEntry[]): RecordEntry[] {
  const review = JSON.parse(fs.readFileSync(`${root}/review.json`, "utf8"));
  if (review.status !== "approved")
    throw new Error("Entity migration requires review");
  for (const file of entityInputFiles.filter(
    (file) => !file.endsWith("/review.json"),
  )) {
    if (!review.files[file]) throw new Error(`Missing review hash ${file}`);
    const expected = review.files[file];
    if (
      createHash("sha256").update(fs.readFileSync(file)).digest("hex") !==
      expected
    )
      throw new Error(`Unreviewed entity input ${file}`);
  }
  const classification = JSON.parse(
    fs.readFileSync(entityInputFiles[0], "utf8"),
  );
  const identityReview = JSON.parse(
    fs.readFileSync(`${root}/classification-review.json`, "utf8"),
  );
  if (
    !["approved", "approved_with_separate_profile_correction"].includes(
      identityReview.status,
    ) ||
    identityReview.mapping_sha256 !== review.files[entityInputFiles[0]]
  )
    throw new Error("Entity classifications need independent approval");
  const commandReview = JSON.parse(
    fs.readFileSync(`${root}/run-review.json`, "utf8"),
  );
  if (commandReview.status !== "approved")
    throw new Error("Run instructions need independent approval");
  for (const [published, original] of [
    ["run-guides.json", "run-guides.json"],
    ["run-audit.jsonl", "audit.jsonl"],
    ["sources.jsonl", "sources.jsonl"],
    ["receipts.json", "receipts.json"],
  ]) {
    if (
      commandReview.files[`workbench/entity-separation/${original}`] !==
      review.files[`${root}/${published}`]
    )
      throw new Error("Run instructions changed since independent review");
  }
  const baselineFile = `data/omics/releases/${classification.baseline_release}.json`;
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  if (classification.baseline_sha256 !== baseline.catalogue_sha256)
    throw new Error("Classification baseline changed");
  const mappings = new Map<
    string,
    {
      id: string;
      from_kind: string;
      to_kind: EntityKind;
      rationale: string;
      source_ids: string[];
      source_locator: string;
      ambiguities: string[];
    }
  >(classification.classifications.map((m: { id: string }) => [m.id, m]));
  if (mappings.size !== classification.classifications.length)
    throw new Error("Duplicate entity classification");
  const sources: RecordEntry[] = fs
    .readFileSync(entityInputFiles[2], "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const byId = new Map([...input, ...sources].map((r) => [r.id, r]));
  if (byId.size !== input.length + sources.length)
    throw new Error("Duplicate run instruction source");
  for (const mapping of mappings.values()) {
    const record = byId.get(mapping.id);
    if (
      !record ||
      record.kind !== mapping.from_kind ||
      !entityKinds.includes(mapping.to_kind) ||
      !mapping.source_ids.length ||
      !mapping.source_locator
    )
      throw new Error(`Invalid entity classification ${mapping.id}`);
    for (const source of mapping.source_ids)
      if (byId.get(source)?.kind !== "source")
        throw new Error(`Unresolved classification evidence ${source}`);
    byId.set(record.id, {
      ...record,
      kind: mapping.to_kind,
      source_ids: [...new Set([...record.source_ids, ...mapping.source_ids])],
      attributes: {
        ...record.attributes,
        ...(record.kind !== mapping.to_kind
          ? { legacy_kinds: [record.kind] }
          : {}),
        entity_classification: {
          review_date: review.review_date,
          rationale: mapping.rationale,
          source_ids: mapping.source_ids,
          source_locator: mapping.source_locator,
          ambiguities: mapping.ambiguities,
        },
      },
    });
  }
  for (const record of publicRecords(input).filter((r) =>
    ["model", "benchmark", "dataset", "baseline"].includes(r.kind),
  )) {
    // Quarantined records are preserved, and receive their known structural kind
    // only when explicitly included in the reviewed map.
    if (
      !mappings.has(record.id) &&
      !["disputed", "excluded"].includes(record.status)
    )
      throw new Error(`Unclassified entity ${record.id}`);
  }
  // LipidBlast is a reference library. Preserve the referenced identity while
  // correcting this baseline's historical model role to a dataset role.
  const lipidBaseline = byId.get(
    "discovery-baseline-lipid-fragmentation-library-match",
  );
  if (
    lipidBaseline &&
    byId.get("discovery-model-lipidblast")?.kind === "dataset"
  ) {
    const links = lipidBaseline.links.map((link) =>
      link.relation === "model" &&
      link.target_id === "discovery-model-lipidblast"
        ? { ...link, relation: "dataset" }
        : link,
    );
    byId.set(lipidBaseline.id, {
      ...lipidBaseline,
      links,
      attributes: {
        ...lipidBaseline.attributes,
        historical_entity_links: lipidBaseline.links,
      },
    });
  }
  const corrections = JSON.parse(
    fs.readFileSync(`${root}/profile-corrections.json`, "utf8"),
  );
  for (const correction of corrections) {
    const original = byId.get(correction.id);
    if (
      !original ||
      !correction.source_ids.length ||
      correction.source_ids.some(
        (id: string) => byId.get(id)?.kind !== "source",
      )
    )
      throw new Error("Invalid profile correction evidence");
    const corrected = structuredClone(original);
    for (const operation of correction.patch) {
      if (
        operation.op !== "replace" ||
        !operation.path.startsWith("/attributes/profile/")
      )
        throw new Error("Profile corrections cannot alter scientific records");
      const parts = operation.path.slice(1).split("/");
      let parent = corrected as unknown as Record<string, unknown>;
      for (const part of parts.slice(0, -1)) {
        if (!(part in parent))
          throw new Error("Missing profile correction path");
        parent = parent[part] as Record<string, unknown>;
      }
      const field = parts.at(-1)!;
      if (!(field in parent))
        throw new Error("Missing profile correction field");
      parent[field] = operation.value;
    }
    corrected.attributes.profile_correction = {
      review_date: correction.review_date,
      review_method: correction.review_method,
      rationale: correction.rationale,
      source_ids: correction.source_ids,
      source_locator: correction.locator,
    };
    byId.set(corrected.id, corrected);
  }
  const guides = JSON.parse(fs.readFileSync(entityInputFiles[1], "utf8"));
  const audits = fs
    .readFileSync(entityInputFiles[3], "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  for (const [field, items] of [
    ["run_guide", guides],
    ["run_documentation", audits],
  ] as const) {
    const seen = new Set();
    for (const item of items) {
      const record = byId.get(item.record_id);
      if (!record || !isBenchmarkSubject(record.kind) || seen.has(record.id))
        throw new Error("Invalid or duplicate run instructions");
      seen.add(record.id);
      byId.set(record.id, {
        ...record,
        source_ids: [
          ...new Set([
            ...record.source_ids,
            ...item.source_ids,
            ...(item.steps || []).flatMap(
              (s: { source_ids: string[] }) => s.source_ids,
            ),
          ]),
        ],
        attributes: { ...record.attributes, [field]: item },
      });
    }
  }
  return [...byId.values()];
}
