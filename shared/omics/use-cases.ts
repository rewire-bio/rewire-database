import { createHash } from "node:crypto";
import { z } from "zod";
import { assertNoPrivateFields } from "./private-fields.js";
import {
  createCatalogueQuery, recordReference,
  type CatalogueSnapshot, type CatalogueRecord, type CatalogueQuery, type ResultRow,
} from "./catalogue-query.js";

const id = z.string().min(1).max(200).regex(/^[a-z0-9][a-z0-9._-]*$/);
const text = z.string().trim().min(1).max(10000);
const texts = z.array(text).max(100);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const releaseId = z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/);
/** A curated supplement is bounded independently of the full catalogue. */
export const MAX_USE_CASE_BYTES = 16_000_000;
const citationSchema = z.object({ source_id: id, locator: text }).strict();
const reviewSchema = z.object({
  method: z.enum(["automated_source_review", "human_domain_review"]),
  actor: text, reviewed_at: z.string().datetime(), note: text,
}).strict();
const useCaseSchema = z.object({
  id, slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: text, question: text, area: text,
  contexts: z.array(z.enum(["research", "clinical_research"])).min(1).max(2),
  search_terms: texts, intended_users: texts.min(1), decision: text,
  inputs: texts.min(1), output: text, setting: text, exclusions: texts,
  clinical_scope: text, evidence_gaps: texts,
  citations: z.array(citationSchema).min(1).max(100), review: reviewSchema,
  // A question can lead collection before any applicability mapping exists.
  // Optional without defaults so historical inputs retain their exact digest.
  collection_plan: z.object({
    status: z.enum(["planned", "collecting"]),
    comparison_question: text,
    baselines: texts.min(1), outcomes: texts.min(1),
    validation_requirements: texts.min(1), next_step: text,
  }).strict().optional(),
  planned_work: z.array(z.object({
    title: text, url: z.string().url().refine((s) => {
      const u = new URL(s);
      return u.protocol === "https:" && !u.username && !u.password;
    }, "Public HTTPS link required"),
    status: z.enum(["planned", "blocked"]), reason: text,
  }).strict()).max(100),
}).strict();
const mappingSchema = z.object({
  id, use_case_id: id,
  lifecycle: z.enum(["draft", "active", "needs_review", "withdrawn", "superseded"]),
  revision: z.number().int().positive(), reason: text,
  prior_release_id: releaseId.optional(), supersedes_id: id.optional(),
  protocol_id: id.optional(), task_id: id.optional(),
  evaluation_ids: z.array(id).max(100), endpoint: text.optional(),
  relevance: z.enum(["direct", "proxy", "outside_scope", "not_assessed"]).optional(),
  rationale: text.optional(), constraints: texts, limitations: texts,
  citations: z.array(citationSchema).max(100), review: reviewSchema.optional(),
  evidence_sha256: digest.optional(),
}).strict();
const inputsSchema = z.object({
  schema_version: z.literal("1.0"),
  use_cases: z.array(useCaseSchema).max(500),
  mappings: z.array(mappingSchema).max(2000),
}).strict();
// A stale release retains the reviewed input state so its logical digest can be
// reconstructed. Curated inputs cannot supply this build-generated metadata.
const artifactMappingSchema = mappingSchema.extend({
  stale_from: z.object({ lifecycle: z.literal("active"), reason: text }).strict().optional(),
}).strict();
const artifactSchema = inputsSchema.extend({
  mappings: z.array(artifactMappingSchema).max(2000),
  release_id: releaseId, input_sha256: digest,
}).strict();
const declarationSchema = z.object({
  schema_version: z.literal("1.0"), input_sha256: digest,
  use_cases: z.number().int().nonnegative().max(500), mappings: z.number().int().nonnegative().max(2000),
}).strict();
export type Citation = z.infer<typeof citationSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type UseCase = z.infer<typeof useCaseSchema>;
export type Mapping = z.infer<typeof artifactMappingSchema>;
export type UseCaseInputs = z.infer<typeof inputsSchema>;
export type UseCaseArtifact = z.infer<typeof artifactSchema>;
export type UseCaseDeclaration = z.infer<typeof declarationSchema>;
export type ResolvedMapping = Mapping & {
  protocol: CatalogueRecord | null; task: CatalogueRecord | null;
  evaluations: {
    evaluation: CatalogueRecord; configurations: CatalogueRecord[];
    // A bounded first page of this evaluation's result rows. The rest is
    // reachable through useCaseEvaluationResults using results_next_cursor.
    results: ResultRow[]; results_total: number; results_next_cursor: string | null;
  }[];
  sources: CatalogueRecord[];
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]),
  );
  return value;
}
export function useCaseHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
/** Default/maximum page sizes for the bounded use-case detail contract.
 * A single use case may reference up to 100 evaluations per mapping and an
 * unbounded number of result rows per evaluation, and each evaluation's own
 * closure (its linked protocol/configuration/source records, repeated per
 * result row) can be far larger than a fixed item count assumes. So every
 * page is bounded by both an item count AND a serialized-byte budget; the
 * byte budget is the binding constraint whenever individual items are large,
 * while the full evidence remains reachable through cursors regardless. */
const EVALUATION_PAGE_LIMIT = 20;
const EVALUATION_PAGE_MAX = 100;
const RESULT_PAGE_LIMIT = 10;
const RESULT_PAGE_MAX = 100;
// Conservative margins under the probe's 1 MB response budget. The evaluation
// and result-page budgets are kept well under 1 MB on their own because a
// get() response also carries the use_case/mapping metadata that wraps them,
// and because one evaluation's own inline result preview (bounded separately
// below) adds to the evaluation-page total. A real production response hit
// 3.7x the 1 MB budget under a fixed item-count cap alone, so these leave a
// wide margin rather than only just clearing it.
const EVALUATION_PAGE_BYTE_BUDGET = 400_000;
const RESULT_PAGE_BYTE_BUDGET = 400_000;
const RESULT_PREVIEW_BYTE_BUDGET = 60_000;
// Hard ceiling on the full wrapped response (release_id/use_case/mapping
// metadata included), left under the probe's 1 MB budget as a margin for the
// tRPC envelope. Hit if a page's items stay under their own byte budget but
// fixed metadata (many mappings, long use-case text) pushes the total over.
const MAX_USE_CASE_RESPONSE_BYTES = 900_000;
function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}
/** A silently oversized response is worse than a loud failure: it would have
 * shipped straight past the probe's budget, as a real release once did at
 * 3.7x. This throws during whichever step first serializes the response —
 * the static build (every use case, every page), the live probe, or a live
 * request — so oversized evidence is caught before it reaches production,
 * never served past the budget. */
function assertResponseBudget(value: unknown, label: string): void {
  const bytes = byteSize({ result: { data: value } });
  if (bytes > MAX_USE_CASE_RESPONSE_BYTES)
    throw Error(`${label} response of ${bytes} bytes exceeds the ${MAX_USE_CASE_RESPONSE_BYTES}-byte safety budget; reduce its page size or investigate oversized evidence`);
}
function paginateBy<T>(
  items: T[],
  input: { cursor?: string; limit?: number },
  scopeValue: unknown,
  maxLimit: number,
  label: string,
  byteBudget: number,
  sizeOf: (item: T) => number,
) {
  const limit = input.limit ?? Math.min(25, maxLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw Error(`${label} limit must be 1–${maxLimit}`);
  const scope = useCaseHash(scopeValue);
  let offset = 0;
  if (input.cursor) {
    if (input.cursor.length > 1000) throw Error(`Invalid ${label} cursor`);
    try {
      const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (decoded.scope !== scope || !Number.isInteger(decoded.offset) || decoded.offset < 0 || decoded.offset > items.length) throw Error();
      offset = decoded.offset;
    } catch { throw Error(`${label} cursor does not match this release and query`); }
  }
  // Bytes are checked incrementally, not by item count or average, so one
  // oversized item cannot hide behind smaller neighbours. A single item that
  // alone exceeds the budget is never silently admitted (that would ship an
  // oversized response past the probe's check): it fails loudly instead, so
  // oversized evidence is caught and fixed upstream rather than served.
  const page: T[] = [];
  let bytes = 0;
  let index = offset;
  while (index < items.length && page.length < limit) {
    const itemBytes = sizeOf(items[index]);
    if (itemBytes > byteBudget)
      throw Error(`${label} item of ${itemBytes} bytes alone exceeds its ${byteBudget}-byte safety budget; this evidence must be reduced upstream, not silently served oversized`);
    if (page.length > 0 && bytes + itemBytes > byteBudget) break;
    page.push(items[index]);
    bytes += itemBytes;
    index++;
  }
  return {
    items: page, total: items.length,
    next_cursor: index < items.length ? Buffer.from(JSON.stringify({ scope, offset: index })).toString("base64url") : null,
  };
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw Error(`Duplicate ${label}`);
}
function tombstone(m: Mapping) { return ["withdrawn", "superseded"].includes(m.lifecycle); }
function positive(m: Mapping) { return m.relevance === "direct" || m.relevance === "proxy"; }
function checked(r: CatalogueRecord) { return ["source_checked", "reproduced"].includes(r.status); }
function inactive(r: CatalogueRecord) { return ["disputed", "excluded", "superseded"].includes(r.status); }
function cleanSource(r: CatalogueRecord | undefined) {
  return r?.kind === "source" && checked(r) &&
    !(Array.isArray(r.attributes.evidence_concerns) && r.attributes.evidence_concerns.length);
}
export function parseUseCaseInputs(value: unknown): UseCaseInputs {
  assertNoPrivateFields(value);
  const inputs = inputsSchema.parse(value);
  unique(inputs.use_cases.map((u) => u.id), "use-case ID");
  unique(inputs.use_cases.map((u) => u.slug), "use-case slug");
  unique(inputs.mappings.map((m) => m.id), "mapping ID");
  const cases = new Set(inputs.use_cases.map((u) => u.id));
  const mappings = new Map(inputs.mappings.map((m) => [m.id, m]));
  for (const u of inputs.use_cases) unique(u.contexts, "context");
  for (const m of inputs.mappings) {
    if (!cases.has(m.use_case_id)) throw Error(`Unknown use case: ${m.use_case_id}`);
    unique(m.evaluation_ids, "evaluation ID");
    if (m.supersedes_id) {
      if (m.supersedes_id === m.id) throw Error("A mapping cannot supersede itself");
      const previous = mappings.get(m.supersedes_id);
      if (!previous || previous.use_case_id !== m.use_case_id || previous.lifecycle !== "superseded" || previous.revision >= m.revision)
        throw Error("Supersession requires a prior superseded revision of the same use case");
    }
    if (tombstone(m)) {
      if (!m.prior_release_id || m.protocol_id || m.task_id || m.evaluation_ids.length || m.citations.length ||
          m.endpoint || m.relevance || m.rationale || m.constraints.length || m.limitations.length || m.evidence_sha256 || m.review)
        throw Error("Withdrawal tombstones retain identity, reason and prior release only");
    } else {
      if (!m.protocol_id || !m.endpoint || !m.relevance || !m.rationale || !m.citations.length)
        throw Error(`Mapping ${m.id} requires scoped protocol evidence`);
      if (!positive(m) && m.evaluation_ids.length) throw Error("Unassessed/outside-scope mappings cannot supply measured evidence");
      if (m.lifecycle === "active" && (!m.review || !m.evidence_sha256)) throw Error("Active mapping requires its own recorded review and fingerprint");
    }
  }
  return {
    ...inputs,
    use_cases: inputs.use_cases.sort((a, b) => a.id.localeCompare(b.id)),
    mappings: inputs.mappings.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
export function useCaseDeclaration(value: UseCaseInputs): UseCaseDeclaration {
  const inputs = parseUseCaseInputs(value);
  return { schema_version: "1.0", input_sha256: useCaseHash(inputs), use_cases: inputs.use_cases.length, mappings: inputs.mappings.length };
}

function index(snapshot: CatalogueSnapshot) {
  const records = new Map(snapshot.records.map((r) => [r.id, r]));
  const results = new Map<string, CatalogueRecord[]>();
  const claims = new Map<string, CatalogueRecord[]>();
  for (const r of snapshot.records) {
    if (r.kind === "result") for (const l of r.links.filter((l) => l.relation === "evaluation"))
      results.set(l.target_id, [...(results.get(l.target_id) || []), r]);
    if (r.kind === "claim") for (const l of r.links.filter((l) => l.relation === "subject")) {
      const key = `${l.target_id}|${r.attributes.field}`;
      claims.set(key, [...(claims.get(key) || []), r]);
    }
  }
  function associationClaims(subject: CatalogueRecord, relation: string, target: string) {
    return subject.links.some((l) => l.relation === relation && l.target_id === target)
      ? (claims.get(`${subject.id}|links:${relation}:${target}`) || []) : [];
  }
  function reviewedAssociation(subject: CatalogueRecord, relation: string, target: string) {
    return associationClaims(subject, relation, target).some((claim) =>
      checked(claim) && claim.attributes.value === target && claim.source_ids.length > 0 &&
      typeof claim.attributes.source_locator === "string" && !!claim.attributes.source_locator.trim() &&
      claim.source_ids.every((s) => cleanSource(records.get(s))),
    );
  }
  return { records, results, associationClaims, reviewedAssociation };
}
type Index = ReturnType<typeof index>;

/** Legacy catalogue roles retain their exact reviewed target identities. A
 * benchmark/task or model family is never promoted to a protocol/configuration. */
function evaluationLinks(ix: Index, evaluation: CatalogueRecord, kind: "protocol" | "configuration") {
  const legacy = kind === "protocol" ? "benchmark" : "model";
  return evaluation.links.filter((link) => link.relation === kind ||
    (link.relation === legacy && ix.records.get(link.target_id)?.kind === kind));
}

/** Exact evidence closure: no suite-to-task or sibling-protocol inference. */
function dependencies(ix: Index, entry: UseCase, mapping: Mapping) {
  const ids = new Set<string>();
  function add(id?: string) {
    if (!id || ids.has(id)) return;
    ids.add(id);
    const r = ix.records.get(id);
    if (r) for (const source of r.source_ids) add(source);
  }
  for (const c of [...entry.citations, ...mapping.citations]) add(c.source_id);
  add(mapping.protocol_id); add(mapping.task_id);
  const protocol = mapping.protocol_id ? ix.records.get(mapping.protocol_id) : undefined;
  if (protocol) {
    for (const link of protocol.links.filter((l) => l.relation === "evaluates_task" || l.relation === "part_of")) {
      add(link.target_id);
      for (const claim of ix.associationClaims(protocol, link.relation, link.target_id)) add(claim.id);
    }
  }
  for (const id of mapping.evaluation_ids) {
    add(id);
    const evaluation = ix.records.get(id);
    for (const result of ix.results.get(id) || []) add(result.id);
    if (!evaluation) continue;
    const configurations = evaluationLinks(ix, evaluation, "configuration");
    for (const l of [
      ...evaluation.links.filter((link) => ["dataset", "dataset_subset"].includes(link.relation)),
      ...evaluationLinks(ix, evaluation, "protocol"), ...configurations,
    ]) add(l.target_id);
    for (const l of configurations) {
      const config = ix.records.get(l.target_id);
      for (const parent of config?.links || []) if (["family", "variant_of", "alias_of"].includes(parent.relation)) {
        add(parent.target_id);
        for (const claim of ix.associationClaims(config!, parent.relation, parent.target_id)) add(claim.id);
      }
    }
  }
  return [...ids].sort().map((id) => ({ id, record: ix.records.get(id) || null }));
}
function evidenceHash(ix: Index, entry: UseCase, mapping: Mapping) {
  return useCaseHash(dependencies(ix, entry, mapping));
}
/** Call only when explicitly reviewing inputs. Builds compare against this value. */
export function mappingEvidenceHash(snapshot: CatalogueSnapshot, entry: UseCase, mapping: Mapping): string {
  return evidenceHash(index(snapshot), entry, mapping);
}
function requireRecord(ix: Index, id: string, kind: string): CatalogueRecord {
  const r = ix.records.get(id);
  if (!r || r.kind !== kind || r.status === "excluded") throw Error(`Missing/wrong-kind public ${kind}: ${id}`);
  return r;
}
function validateCitations(ix: Index, citations: Citation[], positiveClaim: boolean) {
  for (const citation of citations) {
    const source = requireRecord(ix, citation.source_id, "source");
    if (positiveClaim && !cleanSource(source))
      throw Error(`Applicability cannot rely on unchecked/disputed source: ${source.id}`);
  }
}
function validateMapping(ix: Index, entry: UseCase, m: Mapping, activeChecks: boolean) {
  if (tombstone(m)) return;
  const p = requireRecord(ix, m.protocol_id!, "protocol");
  if (m.task_id) {
    const task = requireRecord(ix, m.task_id, "task");
    if (activeChecks && inactive(task)) throw Error("Active applicability cannot target an inactive task");
  }
  validateCitations(ix, m.citations, activeChecks && positive(m));
  if (activeChecks && positive(m) && (!checked(p) || inactive(p))) throw Error("Positive applicability requires a reviewed protocol");
  if (activeChecks && positive(m) && p.source_ids.some((id) => !cleanSource(ix.records.get(id))))
    throw Error("Protocol evidence is disputed or unchecked");
  if (activeChecks && m.task_id && !ix.reviewedAssociation(p, "evaluates_task", m.task_id))
    throw Error("Task membership needs a direct reviewed protocol relationship");
  for (const id of m.evaluation_ids) {
    const e = requireRecord(ix, id, "evaluation");
    if (!evaluationLinks(ix, e, "protocol").some((l) => l.target_id === p.id))
      throw Error(`Evaluation belongs to another protocol: ${id}`);
    const configs = evaluationLinks(ix, e, "configuration").map((l) => requireRecord(ix, l.target_id, "configuration"));
    if (!configs.length) throw Error(`Evaluation has no exact configuration: ${id}`);
    if (activeChecks && (!checked(e) || configs.some((c) => !checked(c)))) throw Error("Evaluation/configuration is not reviewed evidence");
    if (activeChecks && configs.some((c) => c.source_ids.some((id) => !cleanSource(ix.records.get(id)))))
      throw Error("Configuration evidence is disputed or unchecked");
    if (activeChecks) {
      for (const l of e.links.filter((l) => ["dataset", "dataset_subset"].includes(l.relation))) {
        const dataset = ix.records.get(l.target_id);
        if (!dataset || !["dataset", "dataset_subset"].includes(dataset.kind) || inactive(dataset)) throw Error("Evaluation dataset is unavailable");
        if (dataset.source_ids.some((id) => !cleanSource(ix.records.get(id)))) throw Error("Dataset evidence is disputed or unchecked");
      }
      const rows = (ix.results.get(id) || []).filter(checked);
      if (!rows.length) throw Error(`Evaluation has no eligible result: ${id}`);
      for (const r of rows) for (const sourceId of [...r.source_ids, ...e.source_ids]) {
        const source = requireRecord(ix, sourceId, "source");
        if (!cleanSource(source))
          throw Error("Result evidence is disputed or unchecked");
      }
    }
  }
}
function validateEntries(ix: Index, inputs: UseCaseInputs) {
  for (const entry of inputs.use_cases) validateCitations(ix, entry.citations,
    inputs.mappings.some((m) => m.use_case_id === entry.id && m.lifecycle === "active" && positive(m)));
}

export function buildUseCaseArtifact(snapshot: CatalogueSnapshot, value: UseCaseInputs): UseCaseArtifact {
  const inputs = parseUseCaseInputs(value);
  const declaration = useCaseDeclaration(inputs);
  const ix = index(snapshot);
  const entries = new Map(inputs.use_cases.map((u) => [u.id, u]));
  const mappings = inputs.mappings.map((m) => {
    if (m.prior_release_id && (m.prior_release_id === snapshot.release_id || m.prior_release_id.slice(0, 10) > snapshot.release_id.slice(0, 10)))
      throw Error("Mapping history must reference a prior release");
    if (tombstone(m)) return m;
    const entry = entries.get(m.use_case_id)!;
    // Invalid references never become a silently accepted stale assertion.
    validateMapping(ix, entry, m, false);
    const next: Mapping = m.lifecycle === "active" && m.evidence_sha256 !== evidenceHash(ix, entry, m)
      ? { ...m, lifecycle: "needs_review", reason: "Referenced evidence changed since the recorded review. Applicability is withheld pending a new review.",
          stale_from: { lifecycle: "active", reason: m.reason } }
      : m;
    validateMapping(ix, entry, next, next.lifecycle === "active");
    return next;
  });
  validateEntries(ix, { ...inputs, mappings });
  return { ...inputs, mappings, release_id: snapshot.release_id, input_sha256: declaration.input_sha256 };
}
export function validateUseCaseArtifact(snapshot: CatalogueSnapshot, value: unknown, rawDeclaration: UseCaseDeclaration): UseCaseArtifact {
  assertNoPrivateFields(value);
  const artifact = artifactSchema.parse(value);
  const declaration = declarationSchema.parse(rawDeclaration);
  const { release_id, input_sha256, ...input } = artifact;
  const inputs = parseUseCaseInputs({ ...input, mappings: input.mappings.map(({ stale_from, ...mapping }) => {
    if (!stale_from) return mapping;
    if (mapping.lifecycle !== "needs_review") throw Error("Invalid automatic stale mapping state");
    return { ...mapping, ...stale_from };
  }) });
  if (release_id !== snapshot.release_id || input_sha256 !== declaration.input_sha256 ||
      inputs.use_cases.length !== declaration.use_cases || inputs.mappings.length !== declaration.mappings ||
      useCaseDeclaration(inputs).input_sha256 !== input_sha256)
    throw Error("Use-case artifact release/declaration mismatch");
  const expected = buildUseCaseArtifact(snapshot, inputs);
  if (useCaseHash(artifact) !== useCaseHash(expected))
    throw Error("Use-case artifact differs from reviewed inputs or has stale evidence");
  return expected;
}

export interface UseCaseListInput { q?: string; area?: string; context?: string; limit?: number; cursor?: string }
export function useCaseState(snapshot: CatalogueSnapshot, value?: UseCaseArtifact, declaration?: UseCaseDeclaration, catalogue?: CatalogueQuery): UseCaseState {
  if (!!value !== !!declaration) throw Error("Declared use-case artifact must be present");
  const artifact = value ? validateUseCaseArtifact(snapshot, value, declaration!) : undefined;
  const release_id = snapshot.release_id;
  const input_sha256 = artifact?.input_sha256 || null;
  const entries = artifact?.use_cases || [];
  const ix = index(snapshot);
  const q = catalogue || createCatalogueQuery(snapshot);
  const mappingsByCase = new Map<string, ResolvedMapping[]>();
  const backlinks = new Map<string, { use_case_id: string; slug: string; title: string; mapping_id: string; configuration_ids: string[] }[]>();
  const entriesById = new Map(entries.map((u) => [u.id, u]));
  const sourceRecords = (citations: Citation[]) => [...new Set(citations.map((c) => c.source_id))]
    .flatMap((id) => { const r = ix.records.get(id); return r && r.status !== "excluded" ? [recordReference(r)] : []; });
  // Full per-(mapping, evaluation) result rows, keyed for useCaseEvaluationResults.
  // Evaluation entries below only embed a bounded preview of this array.
  const resultsByEvaluation = new Map<string, ResultRow[]>();
  for (const m of artifact?.mappings || []) {
    const live = m.lifecycle === "active" && positive(m);
    const protocol = m.protocol_id ? ix.records.get(m.protocol_id) || null : null;
    const task = m.task_id ? ix.records.get(m.task_id) || null : null;
    const evaluations = live ? m.evaluation_ids.map((id) => {
      const evaluation = ix.records.get(id)!;
      const configurations = evaluationLinks(ix, evaluation, "configuration").map((l) => recordReference(ix.records.get(l.target_id)!));
      const results: ResultRow[] = [];
      let resultsCursor: string | undefined;
      do {
        const page = q.results({ id, limit: 100, ...(resultsCursor ? { cursor: resultsCursor } : {}) });
        results.push(...page.items.filter((r) => r.evaluation?.id === id && checked(r.result)));
        resultsCursor = page.next_cursor || undefined;
      } while (resultsCursor);
      resultsByEvaluation.set(`${m.id}|${id}`, results);
      const preview = paginateBy(
        results, { limit: RESULT_PAGE_LIMIT },
        { kind: "use-case-evaluation-results", release_id, input_sha256, mapping_id: m.id, evaluation_id: id },
        RESULT_PAGE_MAX, "Use-case evaluation results page",
        RESULT_PREVIEW_BYTE_BUDGET, byteSize,
      );
      return { evaluation: recordReference(evaluation), configurations, results: preview.items, results_total: preview.total, results_next_cursor: preview.next_cursor };
    }) : [];
    const resolved: ResolvedMapping = {
      ...m, protocol: protocol ? recordReference(protocol) : null, task: task ? recordReference(task) : null,
      evaluations, sources: sourceRecords(m.citations),
    };
    mappingsByCase.set(m.use_case_id, [...(mappingsByCase.get(m.use_case_id) || []), resolved]);
    if (!live) continue;
    const entry = entriesById.get(m.use_case_id)!;
    const configurationsByTarget = new Map<string, Set<string>>();
    const support = (id: string, configurations: string[]) => {
      const supported = configurationsByTarget.get(id) || new Set<string>();
      for (const configuration of configurations) supported.add(configuration);
      configurationsByTarget.set(id, supported);
    };
    const configurationIds = [...new Set(evaluations.flatMap((e) => e.configurations.map((c) => c.id)))];
    support(m.protocol_id!, configurationIds);
    if (m.task_id) support(m.task_id, configurationIds);
    for (const evaluation of evaluations) support(evaluation.evaluation.id, evaluation.configurations.map((c) => c.id));
    for (const c of evaluations.flatMap((e) => e.configurations)) {
      support(c.id, [c.id]);
      for (const link of c.links) if (["family", "variant_of", "alias_of"].includes(link.relation) && ix.reviewedAssociation(c, link.relation, link.target_id)) {
        const parent = ix.records.get(link.target_id);
        if (parent && ["model", "method", "configuration", "pipeline", "service"].includes(parent.kind) && !inactive(parent)) support(parent.id, [c.id]);
      }
    }
    // Direct reviewed containment is navigation only, never numerical membership.
    for (const link of protocol?.links || []) if (link.relation === "part_of" && ix.reviewedAssociation(protocol!, link.relation, link.target_id)) {
      const parent = ix.records.get(link.target_id);
      if (parent && parent.kind === "benchmark" && !inactive(parent)) support(parent.id, configurationIds);
    }
    for (const [id, configurations] of configurationsByTarget) backlinks.set(id, [...(backlinks.get(id) || []), {
      use_case_id: entry.id, slug: entry.slug, title: entry.title, mapping_id: m.id, configuration_ids: [...configurations].sort(),
    }]);
  }
  const state: UseCaseState = {
    release_id,
    input_sha256,
    entries,
    mappings: [...mappingsByCase],
    backlinks: [...backlinks],
    results: [...resultsByEvaluation],
    sources: entries.map((entry) => [entry.id, sourceRecords(entry.citations)]),
  };
  return state;
}

/** Everything the use-case queries read, resolved once per release. Serialisable. */
export interface UseCaseState {
  release_id: string;
  input_sha256: string | null;
  entries: UseCaseArtifact["use_cases"];
  mappings: [string, ResolvedMapping[]][];
  backlinks: [string, { use_case_id: string; slug: string; title: string; mapping_id: string; configuration_ids: string[] }[]][];
  results: [string, ResultRow[]][];
  sources: [string, CatalogueRecord[]][];
}

export function createUseCaseQuery(snapshot: CatalogueSnapshot, value?: UseCaseArtifact, declaration?: UseCaseDeclaration, catalogue?: CatalogueQuery) {
  return useCaseQueryFrom(useCaseState(snapshot, value, declaration, catalogue));
}

/** The use-case API over a prepared state. */
export function useCaseQueryFrom(state: UseCaseState) {
  const { release_id, input_sha256, entries } = state;
  const mappingsByCase = new Map(state.mappings);
  const backlinks = new Map(state.backlinks);
  const resultsByEvaluation = new Map(state.results);
  const sourcesByCase = new Map(state.sources);
  return {
    list(input: UseCaseListInput = {}) {
      const limit = input.limit ?? 10;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error("Use-case page limit must be 1–100");
      if ((input.q?.length || 0) > 300 || (input.area?.length || 0) > 100 || (input.context?.length || 0) > 100) throw Error("Use-case search is too long");
      const search = input.q?.trim().toLowerCase() || "";
      const terms = search.split(/\s+/).filter(Boolean);
      const filters = { search, area: input.area || "", context: input.context || "" };
      const scope = useCaseHash({ release_id, input_sha256, filters });
      const selected = entries.filter((u) =>
        (!input.area || u.area === input.area) && (!input.context || u.contexts.some((c) => c === input.context)) &&
        terms.every((word) => [u.question, u.title, ...u.search_terms, ...u.inputs, u.setting, u.decision, u.area, ...u.contexts].join(" ").toLowerCase().includes(word)),
      );
      let offset = 0;
      if (input.cursor) {
        if (input.cursor.length > 1000) throw Error("Invalid use-case cursor");
        try {
          const decoded = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
          if (decoded.scope !== scope || !Number.isInteger(decoded.offset) || decoded.offset < 0 || decoded.offset > selected.length) throw Error();
          offset = decoded.offset;
        } catch { throw Error("Use-case cursor does not match this release and search"); }
      }
      const items = selected.slice(offset, offset + limit);
      const next = offset + items.length;
      return { release_id, input_sha256, items, total: selected.length,
        next_cursor: next < selected.length ? Buffer.from(JSON.stringify({ scope, offset: next })).toString("base64url") : null,
        available: { areas: [...new Set(entries.map((u) => u.area))].sort(), contexts: [...new Set(entries.flatMap((u) => u.contexts))].sort() },
      };
    },
    // Mappings are always returned in full; their evaluations are paginated
    // across the whole use case so one page cannot be inflated by a single
    // mapping with many evaluations. Call again with next_cursor via
    // evaluations_next_cursor until it is null for the complete evidence set.
    get({ slug, cursor, limit }: { slug: string; cursor?: string; limit?: number }) {
      const entry = entries.find((u) => u.slug === slug);
      if (!entry) return null;
      const mappings = mappingsByCase.get(entry.id) || [];
      const flattened = mappings.flatMap((m) => m.evaluations.map((evaluation, position) => ({ mapping_id: m.id, position, evaluation })));
      const page = paginateBy(
        flattened, { cursor, limit: limit ?? EVALUATION_PAGE_LIMIT },
        { kind: "use-case-evaluations", release_id, input_sha256, slug },
        EVALUATION_PAGE_MAX, "Use-case evidence page",
        EVALUATION_PAGE_BYTE_BUDGET, (item) => byteSize(item.evaluation),
      );
      const byMapping = new Map<string, ResolvedMapping["evaluations"]>();
      for (const item of page.items) byMapping.set(item.mapping_id, [...(byMapping.get(item.mapping_id) || []), item.evaluation]);
      const response = {
        release_id, input_sha256, use_case: entry,
        mappings: mappings.map((m) => ({ ...m, evaluations: byMapping.get(m.id) || [] })),
        sources: sourcesByCase.get(entry.id) || [],
        evaluations_total: flattened.length,
        evaluations_next_cursor: page.next_cursor,
      };
      // Per-item budgets bound the evaluations array itself, but mapping and
      // use-case metadata (many mappings, long question/review text) is not
      // paginated, so the fully wrapped response is checked here too.
      assertResponseBudget(response, "Use-case detail");
      return response;
    },
    // The rest of one evaluation's result rows beyond the preview embedded in get().
    evaluationResults({ mapping_id, evaluation_id, cursor, limit }: { mapping_id: string; evaluation_id: string; cursor?: string; limit?: number }) {
      const all = resultsByEvaluation.get(`${mapping_id}|${evaluation_id}`) || [];
      const page = paginateBy(
        all, { cursor, limit: limit ?? RESULT_PAGE_LIMIT },
        { kind: "use-case-evaluation-results", release_id, input_sha256, mapping_id, evaluation_id },
        RESULT_PAGE_MAX, "Use-case evaluation results page",
        RESULT_PAGE_BYTE_BUDGET, byteSize,
      );
      const response = { release_id, input_sha256, items: page.items, total: page.total, next_cursor: page.next_cursor };
      assertResponseBudget(response, "Use-case evaluation results");
      return response;
    },
    links({ id }: { id: string }) { return { release_id, input_sha256, items: backlinks.get(id) || [] }; },
    };
}
export type UseCaseQuery = ReturnType<typeof createUseCaseQuery>;
export type UseCasePage = ReturnType<UseCaseQuery["list"]>;
export type UseCaseDetail = NonNullable<ReturnType<UseCaseQuery["get"]>>;
