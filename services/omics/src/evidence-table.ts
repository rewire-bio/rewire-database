import { runGuideSchema } from "./run-guide.js";
import { assertNoPrivateFields } from "./private-fields.js";
import type { CatalogueRecord, CatalogueSnapshot } from "./catalogue-query.js";
import { profileSchema } from "./profile-schema.js";

/** A release-derived index, not a second store of scientific assertions. */
export interface EvidenceRow {
  row_id: string;
  release_id: string;
  record_id: string;
  record_kind: CatalogueRecord["kind"];
  record_name: string;
  field_path: string;
  property: string;
  value: string;
  value_json: string;
  evidence_scope:
    | "individual_claim"
    | "record_context"
    | "catalogue_metadata"
    | "source_metadata";
  review_status: string;
  record_status: string;
  evidence_origin: string;
  claim_id: string;
  claimed_value_json: string;
  claim_record_status: string;
  source_id: string;
  source_title: string;
  source_url: string;
  source_doi: string;
  source_version: string;
  source_locator: string;
  artifact_url: string;
  artifact_sha256: string;
  hash_scope: string;
  artifact_format: string;
  artifact_member: string;
  locator_scope: string;
  source_concerns: string;
  retrieved_at: string;
  review_method: string;
  review_date: string;
  review_note: string;
  extraction_artifact_url: string;
  extraction_artifact_sha256: string;
}
const text = (v: unknown) =>
  typeof v === "string"
    ? v
    : v === undefined || v === null
      ? ""
      : JSON.stringify(v);
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const canonical = (v: unknown): string =>
  JSON.stringify(
    v && typeof v === "object"
      ? Array.isArray(v)
        ? v.map((item) => JSON.parse(canonical(item)))
        : Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((key) => [key, JSON.parse(canonical(object(v)[key]))]),
          )
      : (v ?? null),
  );
const missing = (v: unknown) =>
  v === null ||
  v === undefined ||
  v === "" ||
  (typeof v === "string" &&
    /^(unknown|unreported|unextracted|unavailable|not[ _](reported|applicable|yet_extracted).*)$/.test(
      v,
    ));

type ClaimInput = {
  field: string;
  label: string;
  value: unknown;
  ids?: string[];
  locator?: string;
  scope?: EvidenceRow["evidence_scope"];
  status?: string;
  review?: Record<string, unknown>;
  claimId?: string;
  claimedValue?: unknown;
  claimStatus?: string;
};

export function createEvidenceIndex(snapshot: CatalogueSnapshot) {
  assertNoPrivateFields(snapshot);
  const records = snapshot.records.filter((r) => r.status !== "excluded");
  const byId = new Map(records.map((r) => [r.id, r]));
  const claims = new Map<string, CatalogueRecord[]>();
  for (const record of records.filter((r) => r.kind === "claim")) {
    for (const link of record.links.filter((l) => l.relation === "subject")) {
      const key = `${link.target_id}:${text(record.attributes.field)}`;
      claims.set(key, [...(claims.get(key) || []), record]);
    }
  }
  const cache = new Map<string, EvidenceRow[]>();
  function forRecord(id: string): EvidenceRow[] {
    const cached = cache.get(id);
    if (cached) return cached;
    const record = byId.get(id);
    if (!record) return [];
    const rows: EvidenceRow[] = [];
    const evaluation =
      record.kind === "result"
        ? byId.get(
            record.links.find((l) => l.relation === "evaluation")?.target_id ||
              "",
          )
        : record.kind === "evaluation"
          ? record
          : undefined;
    const origin = text(evaluation?.attributes.origin);
    function add(input: ClaimInput) {
      const review = input.review || {};
      const ids = [...new Set(input.ids || [])].sort();
      for (const sourceId of ids.length ? ids : [""]) {
        const source = byId.get(sourceId);
        if (sourceId && source?.kind !== "source")
          throw new Error(`Unresolved evidence source: ${sourceId}`);
        const attrs = source?.attributes || {};
        rows.push({
          row_id: [record!.id, input.field, input.claimId || "", sourceId]
            .map(encodeURIComponent)
            .join(":"),
          release_id: snapshot.release_id,
          record_id: record!.id,
          record_kind: record!.kind,
          record_name: record!.name,
          field_path: input.field,
          property: input.label,
          value: text(input.value),
          value_json: JSON.stringify(input.value ?? null),
          evidence_scope: input.scope || "record_context",
          review_status: input.status || "not_individually_reviewed",
          record_status: record!.status,
          evidence_origin: origin,
          claim_id: input.claimId || "",
          claimed_value_json:
            input.claimId && input.claimedValue !== undefined
              ? JSON.stringify(input.claimedValue)
              : "",
          claim_record_status: input.claimStatus || "",
          source_id: sourceId,
          source_title: source?.name || "",
          source_url: text(attrs.url),
          source_doi: text(attrs.doi),
          source_version: text(attrs.version),
          source_locator: input.locator || "",
          artifact_url: text(attrs.artifact_url),
          artifact_sha256: text(attrs.artifact_sha256),
          hash_scope:
            text(attrs.hash_scope) ||
            (sourceId === "rewire-mfass-v2-source"
              ? "Local imported data/benchmark-runs/mfass-v2.json; not the upstream repository or result-file hash"
              : text(attrs.extraction_method) ||
                "Hash scope not separately documented; inspect source record"),
          artifact_format: text(attrs.artifact_format),
          artifact_member: text(attrs.artifact_member || attrs.archive_member),
          locator_scope:
            ids.length > 1 ? "shared_claim_locator" : "single_source_locator",
          source_concerns: text(attrs.evidence_concerns),
          retrieved_at: text(attrs.artifact_retrieved_at || attrs.retrieved_at),
          review_method: text(review.method),
          review_date: text(review.reviewed_at || review.date),
          review_note: text(review.notes || review.note),
          extraction_artifact_url: text(review.retrieval_url),
          extraction_artifact_sha256: text(review.artifact_sha256),
        });
      }
    }
    function field(field: string, value: unknown, label = field) {
      const linkedClaims = claims.get(`${record!.id}:${field}`) || [];
      // Retain all explicit claims, including disagreements; never upgrade a value
      // merely because its parent record or an unrelated result is source checked.
      if (linkedClaims.length) {
        for (const claim of linkedClaims) {
          const claimed = Object.hasOwn(claim.attributes, "value")
            ? claim.attributes.value
            : claim.attributes.target_id;
          const resolved =
            claimed !== undefined &&
            claim.source_ids.length > 0 &&
            !!text(claim.attributes.source_locator);
          const matches = resolved && canonical(claimed) === canonical(value);
          add({
            field,
            label,
            value,
            ids: claim.source_ids,
            locator: text(claim.attributes.source_locator),
            scope: "individual_claim",
            status: !resolved
              ? "unresolved_claim"
              : matches
                ? claim.status
                : "conflicting_claim",
            review: {
              ...(matches &&
              record!.kind === "result" &&
              field === "attributes.printed_value" &&
              claim.source_ids.every((id) => record!.source_ids.includes(id)) &&
              text(claim.attributes.source_locator) ===
                text(record!.attributes.source_locator)
                ? object(record!.attributes.review)
                : {}),
              ...object(claim.attributes.review),
            },
            claimId: claim.id,
            claimedValue: claimed,
            claimStatus: claim.status,
          });
        }
        return;
      }
      if (record!.kind === "result" && field === "attributes.printed_value") {
        add({
          field,
          label: "Reported result",
          value,
          ids: record!.source_ids,
          locator: text(record!.attributes.source_locator),
          scope: "individual_claim",
          status: record!.status,
          review: object(record!.attributes.review),
        });
        return;
      }
      const administrative =
        /^(id|kind|status|facets|source_ids)(\.|$)/.test(field) ||
        /^attributes\.(legacy_|historical_|missing_metadata|metadata_review_scope|review|scope_decision|entity_classification)/.test(
          field,
        );
      const sourceMeta = record!.kind === "source";
      add({
        field,
        label,
        value,
        ids: sourceMeta
          ? [record!.id]
          : administrative
            ? []
            : record!.source_ids,
        scope: sourceMeta
          ? "source_metadata"
          : administrative
            ? "catalogue_metadata"
            : "record_context",
        status:
          administrative || sourceMeta
            ? "catalogued"
            : missing(value)
              ? "missing_or_unspecified"
              : "not_individually_reviewed",
        locator:
          administrative || sourceMeta
            ? ""
            : text(record!.attributes.source_locator),
      });
    }
    function flatten(value: unknown, path: string) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length
      ) {
        for (const key of Object.keys(value).sort())
          flatten(object(value)[key], `${path}.${key}`);
      } else field(path, value);
    }
    for (const key of [
      "id",
      "kind",
      "name",
      "description",
      "status",
      "facets",
      "source_ids",
    ] as const)
      flatten(record[key], key);
    for (const link of record.links)
      field(
        `links:${link.relation}:${link.target_id}`,
        link.target_id,
        `Relationship: ${link.relation.replace(/_/g, " ")}`,
      );
    for (const [key, value] of Object.entries(record.attributes).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      if (key !== "profile") flatten(value, `attributes.${key}`);
    }
    const guide = runGuideSchema.safeParse(record.attributes.run_guide);
    if (guide.success)
      guide.data.steps.forEach((step, i) =>
        add({
          field: `attributes.run_guide.steps.${i}.shell`,
          label: `Run commands: ${step.title}`,
          value: step.shell,
          ids: step.source_ids,
          locator: step.source_locator,
          scope: "individual_claim",
          status: "source_checked",
          review: {
            ...guide.data.review,
            note: "Official instructions checked; commands have not been executed and do not establish reproduction.",
          },
        }),
      );
    const parsed = profileSchema.safeParse(record.attributes.profile);
    if (parsed.success) {
      const profile = parsed.data;
      const shared = {
        scope: "individual_claim" as const,
        status: "source_checked",
        review: profile.review,
      };
      add({
        ...shared,
        field: "attributes.profile.summary",
        label: "Introduction",
        value: profile.summary,
        ids: profile.summary_source_ids,
        locator: profile.summary_source_locator,
        status: profile.summary_source_ids?.length
          ? "source_checked"
          : "not_individually_reviewed",
      });
      profile.facts.forEach((fact, i) =>
        add({
          ...shared,
          field: `attributes.profile.facts.${i}.value`,
          label: fact.label,
          value: fact.value,
          ids: fact.source_ids,
          locator: fact.source_locator,
          status: fact.status || "not_individually_reviewed",
        }),
      );
      profile.sections.forEach((section, i) =>
        add({
          ...shared,
          field: `attributes.profile.sections.${i}.body`,
          label: section.title,
          value: section.body,
          ids: section.source_ids,
          locator: section.source_locator,
        }),
      );
      for (const key of ["strengths", "limitations"] as const)
        profile[key].forEach((claim, i) =>
          add({
            ...shared,
            field: `attributes.profile.${key}.${i}.text`,
            label: key === "strengths" ? "Strength" : "Limitation",
            value: claim.text,
            ids: claim.source_ids,
            locator: claim.source_locator,
          }),
        );
      if (profile.diagram) {
        const diagram = profile.diagram;
        for (const key of ["title", "steps", "caption"] as const)
          add({
            ...shared,
            field: `attributes.profile.diagram.${key}`,
            label: `Diagram ${key}`,
            value: diagram[key],
            ids: diagram.source_ids,
            locator: diagram.source_locator,
          });
      }
      for (const key of ["coverage", "gaps", "review"] as const)
        add({
          field: `attributes.profile.${key}`,
          label: `Profile ${key}`,
          value: profile[key],
          scope: "catalogue_metadata",
          status: "catalogued",
        });
    } else if (record.attributes.profile)
      throw new Error(`Invalid evidence profile: ${id}`);
    rows.sort((a, b) => a.row_id.localeCompare(b.row_id));
    if (new Set(rows.map((r) => r.row_id)).size !== rows.length)
      throw new Error(`Duplicate evidence rows: ${id}`);
    cache.set(id, rows);
    return rows;
  }
  return {
    forRecord,
    all: () =>
      records
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .flatMap((r) => forRecord(r.id)),
  };
}

export function evidenceCsv(rows: EvidenceRow[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]) as (keyof EvidenceRow)[];
  // Prefix spreadsheet formulas in CSV only; JSONL/value_json preserve exact values.
  const quote = (value: string) =>
    `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
  return (
    keys.join(",") +
    "\n" +
    rows.map((row) => keys.map((key) => quote(row[key])).join(",")).join("\n") +
    "\n"
  );
}
