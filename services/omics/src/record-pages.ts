import { createHash } from "node:crypto";
import {
  recordReference,
  type CatalogueQuery,
  type CatalogueRecord,
  type CatalogueSnapshot,
  type ResultRow,
} from "./catalogue-query.js";
import { recordRouteKinds } from "./entity-kinds.js";
import { getResearch, type ResearchManifest } from "./research.js";
import { reproductionSchema } from "./run-recipe.js";
import type { createUseCaseQuery } from "./use-cases.js";

/**
 * Server-rendered record pages read one immutable document per route instead
 * of loading the release. Each document is prepared at import from the same
 * validated query engine the API and static pages use, so it holds exactly
 * what those renderers previously read from the complete catalogue.
 */
export const recordPageKinds = ["result", "evaluation"] as const;
export type RecordPageKind = (typeof recordPageKinds)[number];
export const RECORD_PAGE_SCHEMA = "1.0";
/** Uncompressed bound on one page, independent of the stored document limit. */
export const MAX_RECORD_PAGE_BYTES = 8_000_000;
/** Initial pages the existing interactive tables already request. */
export const PAGE_RESULTS_LIMIT = 25;
export const PAGE_EVIDENCE_LIMIT = 10;
export const PAGE_INVESTIGATIONS_LIMIT = 25;

type Query = CatalogueQuery;
type UseCaseLinks = ReturnType<ReturnType<typeof createUseCaseQuery>["links"]>;
type Detail = NonNullable<ReturnType<Query["get"]>>;
export type RecordPageDetail = Pick<
  Detail,
  "release_id" | "record" | "direct" | "reverse" | "sources"
>;
type RecordLink = Pick<CatalogueRecord, "id" | "kind" | "name">;

interface RecordPageBase {
  schema_version: typeof RECORD_PAGE_SCHEMA;
  release_id: string;
  route_kind: RecordPageKind;
  /** The release publishes audit history, so pages link to it. */
  audit_history: boolean;
  detail: RecordPageDetail;
  use_case_links: UseCaseLinks;
  use_case_configurations: Record<string, RecordLink>;
  evidence: ReturnType<Query["evidence"]>;
  identity_subject: CatalogueRecord | null;
  /** Complete records that search metadata and reproduction resolve by ID. */
  context: CatalogueRecord[];
}
export interface ResultRecordPage extends RecordPageBase {
  route_kind: "result";
  first: ResultRow | null;
  /** Family, variant and alias links of tested entities backed by a reviewed claim. */
  verified_families: { subject_id: string; relation: string; target: CatalogueRecord }[];
}
export interface EvaluationRecordPage extends RecordPageBase {
  route_kind: "evaluation";
  results: ReturnType<Query["results"]>;
  readiness: ReturnType<Query["researchReadiness"]>["items"][number] | null;
  manifests: ResearchManifest[];
  manifest_protocols: CatalogueRecord[];
  investigations: ReturnType<Query["investigations"]> | null;
}
export type RecordPage = ResultRecordPage | EvaluationRecordPage;

const familyRelations = ["family", "variant_of", "alias_of"];

/** Same criteria as the website's verifiedAssociation, indexed once per release. */
function associationIndex(records: readonly CatalogueRecord[]) {
  const keys = new Set<string>();
  for (const item of records)
    if (
      item.kind === "claim" &&
      ["source_checked", "reproduced"].includes(item.status) &&
      item.source_ids.length > 0 &&
      !!item.attributes.source_locator
    )
      for (const link of item.links)
        if (link.relation === "subject")
          keys.add(`${link.target_id}|${String(item.attributes.field)}`);
  return (subject: string, relation: string, target: string) =>
    keys.has(`${subject}|links:${relation}:${target}`);
}

/** Records with a materialized route, in the order the static build generated them. */
export function recordPageRoutes(snapshot: CatalogueSnapshot) {
  return snapshot.records
    .filter((record) => record.status !== "excluded")
    .flatMap((record) =>
      recordRouteKinds(record)
        .filter((kind): kind is RecordPageKind =>
          (recordPageKinds as readonly string[]).includes(kind),
        )
        .map((kind) => ({ kind, record })),
    );
}

export function recordPageBuilder(
  query: Query,
  useCases: { links(input: { id: string }): UseCaseLinks },
) {
  const snapshot = query.snapshot();
  const verified = associationIndex(snapshot.records);
  const research = getResearch(snapshot);
  const audit_history = !!snapshot.coverage.audit_history;

  function contextRecords(record: CatalogueRecord, evaluations: (CatalogueRecord | null)[]) {
    const ids = new Set<string>([
      ...record.links.map((link) => link.target_id),
      ...record.source_ids,
    ]);
    for (const evaluation of evaluations) {
      if (!evaluation) continue;
      ids.add(evaluation.id);
      for (const link of evaluation.links) ids.add(link.target_id);
      const recipe = reproductionSchema.safeParse(evaluation.attributes.reproduction);
      if (recipe.success) {
        ids.add(recipe.data.recipe_owner_id);
        for (const id of recipe.data.source_ids) ids.add(id);
      }
    }
    return [...ids]
      .sort()
      .flatMap((id) => {
        const item = query.record(id);
        return item ? [item] : [];
      });
  }

  function base(kind: RecordPageKind, id: string, scope: string) {
    const found = query.get({ id, include_comparisons: false });
    if (!found || !recordRouteKinds(found.record).includes(kind)) return null;
    const { release_id, record, direct, reverse, sources } = found;
    const use_case_links = useCases.links({ id });
    const use_case_configurations = Object.fromEntries(
      [...new Set(use_case_links.items.flatMap((link) => link.configuration_ids))]
        .flatMap((configurationId) => {
          const configuration = query.record(configurationId);
          return configuration
            ? [[configurationId, { id: configuration.id, kind: configuration.kind, name: configuration.name }]]
            : [];
        }),
    );
    const subjectId = (record.attributes.source_identity as { subject_id?: unknown } | undefined)
      ?.subject_id;
    const subject = typeof subjectId === "string" ? query.record(subjectId) : null;
    return {
      schema_version: RECORD_PAGE_SCHEMA,
      release_id,
      audit_history,
      detail: { release_id, record, direct, reverse, sources },
      use_case_links,
      use_case_configurations,
      evidence: query.evidence({ id, scope, limit: PAGE_EVIDENCE_LIMIT }),
      identity_subject: subject ? recordReference(subject) : null,
    } as const;
  }

  function result(id: string): ResultRecordPage | null {
    const shared = base("result", id, "individual_claim");
    if (!shared) return null;
    const first = query.results({ id, limit: 1 }).items[0] || null;
    const tested = first
      ? [...first.models, ...first.methods, ...first.configurations, ...first.pipelines, ...first.services]
      : [];
    const seen = new Set<string>();
    const verified_families = tested.flatMap((model) =>
      model.links.flatMap((link) => {
        const key = `${model.id}|${link.relation}|${link.target_id}`;
        if (seen.has(key) || !familyRelations.includes(link.relation)) return [];
        seen.add(key);
        const target = query.record(link.target_id);
        return target && verified(model.id, link.relation, link.target_id)
          ? [{ subject_id: model.id, relation: link.relation, target: recordReference(target) }]
          : [];
      }),
    );
    return {
      ...shared,
      route_kind: "result",
      context: contextRecords(shared.detail.record, [
        first?.evaluation || null,
        ...shared.detail.record.links
          .filter((link) => link.relation === "evaluation")
          .map((link) => query.record(link.target_id)),
      ]),
      first,
      verified_families,
    };
  }

  function evaluation(id: string): EvaluationRecordPage | null {
    const shared = base("evaluation", id, "record_context");
    if (!shared) return null;
    const readiness = query.researchReadiness({ id, limit: 1 }).items[0] || null;
    const manifests = readiness
      ? research.manifests.filter((manifest) => readiness.manifest_ids.includes(manifest.id))
      : [];
    return {
      ...shared,
      route_kind: "evaluation",
      context: contextRecords(shared.detail.record, [shared.detail.record]),
      results: query.results({ id, limit: PAGE_RESULTS_LIMIT }),
      readiness,
      manifests,
      manifest_protocols: manifests.flatMap((manifest) => {
        const protocol = query.record(manifest.protocol_id);
        return protocol ? [protocol] : [];
      }),
      investigations: readiness
        ? query.investigations({ record_id: id, limit: PAGE_INVESTIGATIONS_LIMIT })
        : null,
    };
  }

  return (kind: RecordPageKind, id: string): RecordPage | null =>
    kind === "result" ? result(id) : evaluation(id);
}

export const recordPageDocumentId = (kind: RecordPageKind, id: string) => `${kind}:${id}`;
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Order-independent digest over every page document identity and hash. */
export function recordPagesDigest(entries: Iterable<{ doc_id: string; sha256: string }>) {
  const lines = [...entries].map((entry) => `${entry.doc_id}\0${entry.sha256}`).sort();
  return sha256(lines.join("\n"));
}

export function validRecordPage(value: unknown, kind: RecordPageKind, id: string, releaseId: string): value is RecordPage {
  const page = value as RecordPage | undefined;
  return (
    !!page &&
    page.schema_version === RECORD_PAGE_SCHEMA &&
    page.route_kind === kind &&
    page.release_id === releaseId &&
    page.detail?.release_id === releaseId &&
    page.detail.record?.id === id &&
    recordRouteKinds(page.detail.record).includes(kind)
  );
}
