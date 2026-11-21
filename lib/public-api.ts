/**
 * The keyless, read-only JSON API under /api/v1. Server only: it reads the pinned release.
 *
 * Every answer is something a page of this site already shows, read through the same functions:
 * the model and benchmark indexes, a use case's leaderboard, a model's result table and the
 * contested findings. Nothing is selected, scored or combined here. One table (ENDPOINTS) drives
 * the handler, the OpenAPI description and the docs page, so the three cannot disagree.
 *
 * No state: no keys, sessions, counters or writes. Rate limiting is Cloudflare's.
 */

import { z } from "zod";
import { paginate, type CatalogueRecord, type ResultRow } from "../shared/omics/catalogue-query";
import { listings, severities, type DiscrepancySummary } from "../shared/omics/discrepancies";
import { SITE } from "./agent-connect";
import { buildCatalogue } from "./catalogue-build";
import { indexRecords, indexSource, indexSummary, type IndexKind } from "./catalogue-index";
import { catalogueText } from "./catalogue-text";
import { DATA_LICENCE, DATABASE_NAME, releaseCitation } from "./data-licence";
import { dataPin } from "./data-pin";
import { contestedResults, discrepancyHref, openFindingsForSystem } from "./discrepancies";
import { recordHref, safeSourceUrl, type OmicsRecord } from "./omics";
import { datasetEntities, evaluationEntities, testedEntities } from "./omics-browse";
import { telemetryFromRecord } from "./operational-telemetry";
import { leaderboardForUseCase, rankingsForRecord, runReceiptSources } from "./release-leaderboard";
import { isIndependentOrigin } from "./result-origin";
import { boardStats, boardStatsText, protocolLabel, type BiologicalModelRankingRow, type LeaderboardResult } from "./use-case-leaderboard";
import { reviewOf } from "./use-case-ranking";
import { buildUseCases } from "./use-cases-build";

export const API_BASE = "/api/v1";
export const API_DOCS_PATH = "/agents/api/";
export const API_VERSION = "1.0.0";
/** Browsers and shared caches may reuse an answer briefly; the edge keys its own copy by release. */
export const API_CACHE_CONTROL = "public, max-age=300";

const site = (path: string) => `${SITE}${path}`;
const api = (path: string) => `${SITE}${API_BASE}${path}`;
const RECORD_ID = /^[a-z0-9][a-z0-9-]{0,254}$/;
const RELEASE_ID = /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;

// ---------------------------------------------------------------------------------------------
// Response shapes. The same zod schemas become the OpenAPI schemas and check the answers in tests.
// ---------------------------------------------------------------------------------------------

const nullableString = z.string().nullable();

const ReleaseShape = z.strictObject({
  id: z.string().describe("The data release every value in this answer was read from."),
  released_at: z.string(),
  repository: z.string().describe("The repository that publishes the release."),
  revision: z.string().describe("The commit of that repository the release was built from."),
  manifest_url: z.string().describe("The release manifest, with SHA-256 checksums of the release files."),
});

const LicenceShape = z.strictObject({
  spdx_id: nullableString.describe("SPDX identifier of the data licence; null while no licence is stated."),
  name: nullableString,
  url: nullableString,
  statement: z.string().describe("The licence position in one sentence."),
});

const SourceLink = z.strictObject({
  id: z.string().describe("Source record id in the release."),
  name: z.string(),
  url: z.string().describe("The source's page on this site."),
  source_url: nullableString.describe("Where the source itself is published, when the record gives a web address."),
  doi: nullableString,
});

const Reference = z.strictObject({ id: z.string(), kind: z.string(), name: z.string(), url: z.string() });

const FindingLink = z.strictObject({
  id: z.string(),
  label: z.string(),
  url: z.string().describe("The finding's page on this site."),
  api_url: z.string(),
});

const ReviewStatus = z.enum(["reproduced", "source_checked", "author_reported"]).describe(
  "reproduced: the result or its evaluation cites a run receipt in the release. source_checked: the value was checked against the source it cites, which is not a reproduction. author_reported: as reported, not yet checked.",
);

const Receipt = z.strictObject({ id: z.string(), name: z.string(), url: z.string() }).nullable()
  .describe("The run receipt's source record behind a reproduced value; null for every other status.");

const Telemetry = z.strictObject({
  inference_latency_ms: z.number().nullable(),
  throughput_items_per_sec: z.number().nullable(),
  min_vram_gb: z.number().nullable(),
  estimated_cost_per_1k_evals_usd: z.number().nullable(),
  parameters: nullableString,
  context_window: nullableString,
  license: nullableString.describe("The model's own licence text as its record writes it. This is not the data licence."),
  license_scope: z.enum(["weights", "record", "code", "tool"]).nullable()
    .describe("Which licence the text is. code: a code licence is recorded and the weights terms are not."),
  access: nullableString,
  open_weights: z.boolean().nullable(),
}).describe("Hardware and access facts read from the model record. Null means not recorded, not zero.");

const Facets = z.record(z.string(), z.array(z.string()));

const RecordStatus = z.string().describe(
  "The record's review state in the release, for example source_checked, or discovered for a record that was found and is not yet reviewed. A record the release marks reproduced is given as source_checked here: this API says reproduced only in review_status, and only with a run receipt.",
);

const ModelSummary = z.strictObject({
  id: z.string(), name: z.string(), summary: z.string(), record_status: RecordStatus, facets: Facets,
  url: z.string().describe("The model's page on this site."),
  api_url: z.string(), results_url: z.string(),
});

const BenchmarkSummary = z.strictObject({
  id: z.string(), name: z.string(), summary: z.string(), record_status: RecordStatus, facets: Facets,
  url: z.string().describe("The benchmark's page on this site."),
});

const Direction = z.enum(["higher", "lower"]);
const Relevance = z.enum(["direct", "proxy"]).describe(
  "direct: the use case's reviewers judged the protocol directly relevant. proxy: no directly relevant protocol ranks two tools, so a related one is used and labelled.",
);

const ModelRanking = z.strictObject({
  use_case_slug: z.string(), use_case_title: z.string(), use_case_url: z.string(), board_url: z.string(),
  protocol: z.string().describe("The benchmark or study and column the use case is ranked on."),
  relevance: Relevance,
  metric_label: z.string(), direction: Direction,
  rank: z.number().int().nullable(), ranked_rows: z.number().int(),
  display_value: z.string(), raw_metric_value: z.number().nullable(),
  configuration_id: z.string().describe("The configuration of the model that holds this rank."),
  result_id: z.string(), result_url: z.string(),
  origin: nullableString, independent: z.boolean(),
  reviewed_status: ReviewStatus, receipt: Receipt,
});

const ModelDetail = z.strictObject({
  id: z.string(), name: z.string(), description: z.string(), record_status: RecordStatus, facets: Facets,
  url: z.string(), results_url: z.string(),
  telemetry: Telemetry,
  sources: z.array(SourceLink).describe("The sources the model record cites."),
  rankings: z.array(ModelRanking).describe(
    "The model's best-ranked configuration on each use-case leaderboard it appears on. Each rank holds for one protocol only. Ranks are never combined into one score.",
  ),
  open_findings: z.array(FindingLink).describe("Unsettled findings in which studies disagree about this model."),
});

const ResultItem = z.strictObject({
  id: z.string().describe("Result record id in the release."),
  url: z.string().describe("The result's page on this site."),
  metric: nullableString, metric_qualifier: nullableString,
  metric_direction: nullableString.describe("higher or lower when the release states which is better; otherwise unknown."),
  numeric_value: z.number().nullable().describe("The value as a number, when the release records one."),
  printed_value: nullableString.describe("The value as the source prints it."),
  unit: nullableString,
  origin: nullableString.describe("Who produced the result, as its evaluation record states it; null when the record has no origin."),
  independent: z.boolean().describe("True only for an independent study. Unreported is not independent, nor is a Rewire run."),
  review_status: ReviewStatus, receipt: Receipt,
  record_status: RecordStatus,
  evaluation: Reference.nullable(),
  tested: z.array(Reference).describe("The models, methods, configurations, pipelines and services the result scores."),
  evaluated_on: z.array(Reference).describe("The benchmarks, tasks, protocols and evaluators the result was measured with."),
  datasets: z.array(Reference),
  sources: z.array(SourceLink).describe("Every source the result cites."),
  open_findings: z.array(FindingLink).describe("Unsettled findings this result takes part in."),
});

const ModelResults = z.strictObject({
  model: z.strictObject({ id: z.string(), name: z.string(), url: z.string(), api_url: z.string() }),
  evaluation_count: z.number().int(),
  results: z.array(ResultItem),
});

const RankingProtocol = z.strictObject({
  comparison_id: z.string(), title: z.string(), column_label: z.string(),
  metric: z.string(), metric_label: z.string(), direction: Direction, endpoint: z.string(),
  relevance: Relevance,
});

const BoardRow = z.strictObject({
  model_id: z.string().describe("The configuration the value belongs to; unique within a board."),
  model_name: z.string(), model_detail: nullableString, model_href: z.string(),
  parent_id: nullableString.describe("The model, method or pipeline the configuration belongs to."),
  use_case_slug: z.string(), primary_metric_name: z.string(),
  raw_metric_value: z.number().nullable(), display_value: z.string(),
  rank: z.number().int().nullable().describe("Competition rank within the protocol (1, 2, 2, 4)."),
  margin_over_conventional: z.number().nullable().describe("Percent over the one baseline scored on the same protocol; null without one."),
  telemetry: Telemetry, pareto_optimal: z.boolean(),
  reviewed_status: ReviewStatus,
  receipt: z.strictObject({ id: z.string(), name: z.string(), href: z.string() }).nullable(),
  origin: nullableString, independent: z.boolean(),
  source_record_id: z.string().describe("The result record the value is read from."),
  evaluation_id: nullableString,
  source: z.strictObject({ id: z.string(), name: z.string(), href: z.string(), doi: nullableString }).nullable(),
  source_ids: z.array(z.string()),
  coverage: z.strictObject({ evaluated: z.number().int(), relevant: z.number().int() }),
  open_findings: z.array(z.strictObject({ id: z.string(), href: z.string(), label: z.string() })),
  is_baseline: z.boolean(), method_types: z.array(z.string()),
  links: z.strictObject({
    model: z.string(), result: z.string(), evaluation: nullableString, receipt: nullableString,
  }).describe("Absolute addresses of the row's pages on this site."),
  sources: z.array(SourceLink).describe("Every source the ranked result cites."),
});

const Board = z.strictObject({
  use_case_slug: z.string(), use_case_title: z.string(), use_case_url: z.string(),
  ranked: z.boolean().describe("False when the release ranks nothing for this use case; empty_reason says why."),
  protocol: RankingProtocol.nullable().describe("The one comparison and column the use case is ranked on. Ranks never mix protocols."),
  protocol_label: nullableString,
  baseline: z.strictObject({
    name: z.string(), model_id: z.string(), value: z.number(), display_value: z.string(), source_record_id: z.string(),
  }).nullable(),
  stats: z.strictObject({
    rows: z.number().int(), tools: z.number().int(), sources: z.number().int(),
    independent: z.number().int(), foundation_models: z.number().int(),
    other_origins: z.array(z.strictObject({ origin: nullableString, rows: z.number().int() })),
    top_origin: nullableString.optional(),
    text: z.string().describe("The same counts as the sentence the site prints under the board."),
  }).nullable(),
  rows: z.array(BoardRow),
  unranked: z.array(z.strictObject({
    model_id: z.string(), model_name: z.string(), model_url: z.string(),
    coverage: z.strictObject({ evaluated: z.number().int(), relevant: z.number().int() }),
  })).describe("Tools evaluated elsewhere in the use case but not on this protocol: listed, not ranked."),
  empty_reason: nullableString,
});

const UseCaseSummary = z.strictObject({
  slug: z.string(), title: z.string(), question: z.string(), area: z.string(), contexts: z.array(z.string()),
  url: z.string(), board_url: z.string(),
  board: z.strictObject({
    ranked: z.boolean(), protocol_label: nullableString, relevance: Relevance.nullable(),
    metric_label: nullableString, direction: Direction.nullable(), rows: z.number().int(),
  }),
});

const FindingSummary = z.strictObject({
  id: z.string(), rule: z.string(), label: z.string(), summary: z.string(), severity: z.string(), scope: z.string(),
  listing: z.string(), state: z.string(), settled: z.boolean(), resolved: z.boolean(), systems: z.array(z.string()),
  actions: z.number().int(), last_action_date: nullableString, next_check: nullableString,
  url: z.string(), api_url: z.string(),
});

const Tally = z.record(z.string(), z.number().int());
const ContestedList = z.strictObject({
  available: z.boolean().describe("False when the release carries no discrepancy data."),
  counts: z.strictObject({ severity: Tally, state: Tally, rule: Tally, listing: Tally }),
  findings: z.array(FindingSummary),
});

const ResultLink = z.strictObject({ id: z.string(), url: z.string() });
const sides = <T extends z.ZodType>(item: T) => z.strictObject({ outlier: z.array(item), consensus: z.array(item), party: z.array(item) });
const ContestedDetail = z.strictObject({
  url: z.string(),
  finding: z.looseObject({
    id: z.string(), label: z.string(), summary: z.string(), severity: z.string(), state: z.string(), settled: z.boolean(),
    systems: z.array(z.string()),
  }).describe("The finding as the release stores it: its studies, numbers and follow-up actions. A finding is a lead to investigate, not a finding of error."),
  systems: z.array(Reference).describe("The models, methods or configurations the finding compares."),
  sources: sides(SourceLink).describe("The sources of the disagreeing study (outlier), of the studies that agree (consensus), or of both studies of a two-study conflict (party)."),
  results: sides(ResultLink),
});

const Index = z.strictObject({
  name: z.string(), description: z.string(), version: z.string(),
  openapi_url: z.string(), docs_url: z.string(),
  endpoints: z.array(z.strictObject({ path: z.string(), url: z.string(), summary: z.string() })),
});

const PageShape = z.strictObject({
  total: z.number().int(), next_cursor: nullableString,
  next_url: nullableString.describe("The address of the next page; null on the last one."),
});
const LinksShape = z.strictObject({
  self: z.string(), docs: z.string(), openapi: z.string(),
  html: nullableString.describe("The page of this site that shows the same content."),
});

const envelope = (data: z.ZodType, paged: boolean) => z.strictObject({
  release: ReleaseShape,
  licence: LicenceShape,
  citation: z.string().describe("How to cite the release this answer was read from."),
  links: LinksShape,
  ...(paged ? { page: PageShape } : {}),
  data,
});

export const ErrorShape = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
  release: z.strictObject({ id: z.string() }),
  links: z.strictObject({ docs: z.string(), openapi: z.string() }),
});

// ---------------------------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(public status: 400 | 404 | 405, public code: string, message: string) { super(message); }
}

interface Param { description: string; schema: Record<string, unknown>; parse: (raw: string) => string | number }

const text = (description: string, max: number, pattern?: RegExp): Param => ({
  description,
  schema: { type: "string", maxLength: max, ...(pattern ? { pattern: pattern.source } : {}) },
  parse: (raw) => {
    if (!raw || raw.length > max || (pattern && !pattern.test(raw))) throw new Error("is not valid");
    return raw;
  },
});
const choice = (description: string, values: readonly string[]): Param => ({
  description,
  schema: { type: "string", enum: [...values] },
  parse: (raw) => {
    if (!values.includes(raw)) throw new Error(`must be one of ${values.join(", ")}`);
    return raw;
  },
});
const limit = (max: number, fallback: number): Param => ({
  description: `Items per page, 1 to ${max}. Default ${fallback}.`,
  schema: { type: "integer", minimum: 1, maximum: max, default: fallback },
  parse: (raw) => {
    const value = Number(raw);
    if (!/^[0-9]{1,4}$/.test(raw) || value < 1 || value > max) throw new Error(`must be a whole number from 1 to ${max}`);
    return value;
  },
});
const CURSOR = text("The next_cursor of the previous page. A cursor is valid only for the release and filters it came from.", 8000);
const RELEASE = text(
  "Pin the request to one release. A release other than the one served is answered with 404, never from another release.",
  25, RELEASE_ID,
);

// ---------------------------------------------------------------------------------------------
// Readers. Each one is the call an existing page makes.
// ---------------------------------------------------------------------------------------------

type Lookup = (id: string) => CatalogueRecord | null;

function lookup(): Lookup {
  const { query } = buildCatalogue();
  const seen = new Map<string, CatalogueRecord | null>();
  return (id) => {
    if (!seen.has(id)) seen.set(id, query.record(id));
    return seen.get(id)!;
  };
}

const sourceLinks = (ids: readonly string[], record: Lookup): z.infer<typeof SourceLink>[] =>
  [...new Set(ids)].flatMap((id) => {
    const source = record(id);
    return source ? [{
      id: source.id,
      name: catalogueText(source.name),
      url: site(recordHref(source)),
      source_url: safeSourceUrl(source.attributes.url) ?? null,
      doi: typeof source.attributes.doi === "string" && source.attributes.doi ? source.attributes.doi : null,
    }] : [];
  });

const reference = (record: Pick<CatalogueRecord, "id" | "kind" | "name">): z.infer<typeof Reference> =>
  ({ id: record.id, kind: record.kind, name: catalogueText(record.name), url: site(recordHref(record)) });

const findingLink = (d: Pick<DiscrepancySummary, "id" | "label">): z.infer<typeof FindingLink> =>
  ({ id: d.id, label: d.label, url: site(discrepancyHref(d.id)), api_url: api(`/contested/${d.id}/`) });

let indexes: { query: unknown; lists: Map<IndexKind, OmicsRecord[]> } | undefined;

/** The records the /models/ and /benchmarks/ index pages list, in their order. */
function indexList(kind: IndexKind): OmicsRecord[] {
  const { query } = buildCatalogue();
  if (indexes?.query !== query) indexes = { query, lists: new Map() };
  if (!indexes.lists.has(kind)) indexes.lists.set(kind, indexRecords(indexSource(query, kind), kind));
  return indexes.lists.get(kind)!;
}

function indexPage(kind: IndexKind, input: Input) {
  const { query } = buildCatalogue();
  return paginate(query.release_id, indexList(kind), { cursor: input.cursor as string | undefined, limit: (input.limit as number | undefined) ?? 100 }, `api-v1-${kind}`, (r) => r.id);
}

function model(id: string): CatalogueRecord {
  const record = RECORD_ID.test(id) ? buildCatalogue().query.record(id) : null;
  if (!record || record.kind !== "model" || record.status === "excluded")
    throw new ApiError(404, "not_found", `No model ${id} in this release. List the models at ${api("/models/")}.`);
  return record;
}

const asText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);
/** The release writes numeric values as numbers or as decimal strings. Anything else is not a number. */
const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
/** A record's own status. "reproduced" is never passed on from it: only a cited run receipt says that (reviewOf). */
const recordStatus = (record: Pick<CatalogueRecord, "status">) => (record.status === "reproduced" ? "source_checked" : record.status);

export function resultItem(row: ResultRow, record: Lookup, receipts: ReadonlySet<string>, findings: ReturnType<typeof contestedResults>): z.infer<typeof ResultItem> {
  const { result, evaluation } = row;
  const review = reviewOf(result, evaluation, receipts, record);
  const origin = asText(evaluation?.attributes.origin);
  const printed = result.attributes.printed_value;
  const open = new Map<string, z.infer<typeof FindingLink>>();
  for (const { discrepancy } of findings[result.id] ?? []) if (!discrepancy.settled) open.set(discrepancy.id, findingLink(discrepancy));
  return {
    id: result.id,
    url: site(recordHref(result)),
    metric: asText(result.attributes.metric),
    metric_qualifier: asText(result.attributes.metric_qualifier),
    metric_direction: asText(result.attributes.metric_direction),
    numeric_value: asNumber(result.attributes.numeric_value),
    printed_value: typeof printed === "number" ? String(printed) : asText(printed),
    unit: asText(result.attributes.unit),
    origin,
    independent: isIndependentOrigin(origin),
    review_status: review.status,
    receipt: review.receipt ? { id: review.receipt.id, name: catalogueText(review.receipt.name), url: site(recordHref(review.receipt)) } : null,
    record_status: recordStatus(result),
    evaluation: evaluation ? reference(evaluation) : null,
    // Grouped as the result tables on the site group them.
    tested: testedEntities(row).map(reference),
    evaluated_on: evaluationEntities(row).map(reference),
    datasets: datasetEntities(row).map(reference),
    // The row's sources are the result's own; the ids are read from the record so none is dropped.
    sources: sourceLinks(result.source_ids, record),
    open_findings: [...open.values()],
  };
}

function boardRow(row: BiologicalModelRankingRow, record: Lookup): z.infer<typeof BoardRow> {
  return {
    ...row,
    links: {
      model: site(row.model_href),
      result: site(recordHref({ kind: "result", id: row.source_record_id })),
      evaluation: row.evaluation_id ? site(recordHref({ kind: "evaluation", id: row.evaluation_id })) : null,
      receipt: row.receipt ? site(row.receipt.href) : null,
    },
    sources: sourceLinks(row.source_ids, record),
  };
}

function boardData(board: LeaderboardResult): z.infer<typeof Board> {
  const record = lookup();
  const ranked = !!board.protocol && board.rows.length > 0;
  const stats = ranked ? boardStats(board) : null;
  return {
    use_case_slug: board.use_case_slug,
    use_case_title: board.use_case_title,
    use_case_url: site(board.use_case_href),
    ranked,
    protocol: board.protocol,
    protocol_label: board.protocol ? protocolLabel(board.protocol) : null,
    baseline: board.baseline,
    stats: stats ? { ...stats, text: boardStatsText(stats) } : null,
    rows: board.rows.map((row) => boardRow(row, record)),
    unranked: board.unranked.map((m) => ({ model_id: m.model_id, model_name: m.model_name, model_url: site(m.model_href), coverage: m.coverage })),
    empty_reason: board.empty_reason,
  };
}

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

type Input = Record<string, string | number | undefined>;
interface Answer { data: unknown; html?: string; page?: { total: number; next_cursor: string | null } }

export interface Endpoint {
  /** Path under /api/v1, in OpenAPI form. */
  path: string;
  id: string;
  summary: string;
  description: string;
  /** Path parameters, by name. */
  pathParams?: Record<string, string>;
  query?: Record<string, Param>;
  data: z.ZodType;
  /** A path the docs page and the tests can call as written; null when it needs an id from the release. */
  example: string | null;
  run: (params: Record<string, string>, input: Input) => Answer;
}

const typed = <T extends z.ZodType>(schema: T, value: z.infer<T>): z.infer<T> => value;

export const ENDPOINTS: Endpoint[] = [
  {
    path: "/", id: "index", example: "/",
    summary: "The endpoints of this API",
    description: "Lists every endpoint with its address, and links the OpenAPI description and the docs page.",
    data: Index,
    run: () => ({
      html: API_DOCS_PATH,
      data: typed(Index, {
        name: `${DATABASE_NAME} API`,
        description: "Read-only JSON over the release this site serves. No key is needed. Every answer names the release it was read from.",
        version: API_VERSION,
        openapi_url: api("/openapi.json"),
        docs_url: site(API_DOCS_PATH),
        endpoints: ENDPOINTS.map((e) => ({ path: `${API_BASE}${e.path}`, url: api(e.path), summary: e.summary })),
      }),
    }),
  },
  {
    path: "/models/", id: "listModels", example: "/models/?limit=5",
    summary: "List models",
    description: "The models the release holds, in the order of the site's model index (by name).",
    query: { limit: limit(100, 100), cursor: CURSOR },
    data: z.array(ModelSummary),
    run: (_params, input) => {
      const page = indexPage("model", input);
      return {
        html: "/models/",
        page: { total: page.total, next_cursor: page.next_cursor },
        data: typed(z.array(ModelSummary), page.items.map((r) => ({
          id: r.id, name: catalogueText(r.name), summary: indexSummary(r), record_status: recordStatus(r), facets: r.facets,
          url: site(recordHref(r)), api_url: api(`/models/${r.id}/`), results_url: api(`/models/${r.id}/results/`),
        }))),
      };
    },
  },
  {
    path: "/models/{id}/", id: "getModel", example: null,
    summary: "One model",
    description: "A model record with the sources it cites, its recorded hardware and access facts, its rank on each use-case leaderboard it appears on, and the unsettled findings about it.",
    pathParams: { id: "Model record id, as listed by /models/." },
    data: ModelDetail,
    run: ({ id }) => {
      const record = model(id);
      const find = lookup();
      return {
        html: recordHref(record),
        data: typed(ModelDetail, {
          id: record.id,
          name: catalogueText(record.name),
          description: catalogueText(record.description),
          record_status: recordStatus(record),
          facets: record.facets,
          url: site(recordHref(record)),
          results_url: api(`/models/${record.id}/results/`),
          telemetry: telemetryFromRecord(record),
          sources: sourceLinks(record.source_ids, find),
          rankings: rankingsForRecord(record.id).map(({ board, row }) => ({
            use_case_slug: board.use_case_slug,
            use_case_title: board.use_case_title,
            use_case_url: site(board.use_case_href),
            board_url: api(`/use-cases/${board.use_case_slug}/board/`),
            protocol: protocolLabel(board.protocol!),
            relevance: board.protocol!.relevance,
            metric_label: board.protocol!.metric_label,
            direction: board.protocol!.direction,
            rank: row.rank,
            ranked_rows: board.rows.length,
            display_value: row.display_value,
            raw_metric_value: row.raw_metric_value,
            configuration_id: row.model_id,
            result_id: row.source_record_id,
            result_url: site(recordHref({ kind: "result", id: row.source_record_id })),
            origin: row.origin,
            independent: row.independent,
            reviewed_status: row.reviewed_status,
            receipt: row.receipt ? { id: row.receipt.id, name: row.receipt.name, url: site(row.receipt.href) } : null,
          })),
          open_findings: openFindingsForSystem(record.id).map(findingLink),
        }),
      };
    },
  },
  {
    path: "/models/{id}/results/", id: "listModelResults", example: null,
    summary: "Results for a model",
    description: "The published results the release links to a model, as the model's page lists them. Each result carries its origin, its review status and a link to every source it cites.",
    pathParams: { id: "Model record id, as listed by /models/." },
    query: {
      limit: limit(100, 25), cursor: CURSOR,
      metric: text("Only results of this metric, by its id in the release (for example spearman).", 200),
      origin: text("Only results whose evaluation has this origin (for example independent_paper).", 100),
    },
    data: ModelResults,
    run: ({ id }, input) => {
      const record = model(id);
      const { query } = buildCatalogue();
      const page = query.results({
        id: record.id, limit: (input.limit as number | undefined) ?? 25,
        ...(input.cursor ? { cursor: String(input.cursor) } : {}),
        ...(input.metric ? { metric: String(input.metric) } : {}),
        ...(input.origin ? { origin: String(input.origin) } : {}),
      });
      const find = lookup();
      const findings = contestedResults(page.items.map((row) => row.result.id));
      const receipts = runReceiptSources(query);
      return {
        html: recordHref(record),
        page: { total: page.total, next_cursor: page.next_cursor },
        data: typed(ModelResults, {
          model: { id: record.id, name: catalogueText(record.name), url: site(recordHref(record)), api_url: api(`/models/${record.id}/`) },
          evaluation_count: page.evaluation_count,
          results: page.items.map((row) => resultItem(row, find, receipts, findings)),
        }),
      };
    },
  },
  {
    path: "/benchmarks/", id: "listBenchmarks", example: "/benchmarks/?limit=5",
    summary: "List benchmarks",
    description: "The benchmark suites and challenges the release holds, in the order of the site's benchmark index (by name).",
    query: { limit: limit(100, 100), cursor: CURSOR },
    data: z.array(BenchmarkSummary),
    run: (_params, input) => {
      const page = indexPage("benchmark", input);
      return {
        html: "/benchmarks/",
        page: { total: page.total, next_cursor: page.next_cursor },
        data: typed(z.array(BenchmarkSummary), page.items.map((r) => ({
          id: r.id, name: catalogueText(r.name), summary: indexSummary(r), record_status: recordStatus(r), facets: r.facets, url: site(recordHref(r)),
        }))),
      };
    },
  },
  {
    path: "/use-cases/", id: "listUseCases", example: "/use-cases/",
    summary: "List use cases",
    description: "Every use case in the release, with the protocol its leaderboard is ranked on, if any.",
    data: z.array(UseCaseSummary),
    run: () => {
      const entries = buildUseCases().entries ?? [];
      return {
        html: "/use-cases/",
        data: typed(z.array(UseCaseSummary), entries.map((entry) => {
          const board = leaderboardForUseCase(entry.slug);
          const protocol = board?.rows.length ? board.protocol : null;
          return {
            slug: entry.slug, title: entry.title, question: entry.question, area: entry.area, contexts: [...entry.contexts],
            url: site(`/use-cases/${entry.slug}/`),
            board_url: api(`/use-cases/${entry.slug}/board/`),
            board: {
              ranked: !!protocol,
              protocol_label: protocol ? protocolLabel(protocol) : null,
              relevance: protocol?.relevance ?? null,
              metric_label: protocol?.metric_label ?? null,
              direction: protocol?.direction ?? null,
              rows: protocol ? board!.rows.length : 0,
            },
          };
        })),
      };
    },
  },
  {
    path: "/use-cases/{slug}/board/", id: "getUseCaseBoard", example: null,
    summary: "The leaderboard for a use case",
    description: "The ranking the use case's page shows: one protocol, one metric, never a composite. protocol.relevance says whether the protocol is directly relevant or a proxy. When nothing is ranked, ranked is false and empty_reason says why.",
    pathParams: { slug: "Use-case slug, as listed by /use-cases/." },
    data: Board,
    run: ({ slug }) => {
      const board = RECORD_ID.test(slug) ? leaderboardForUseCase(slug) : null;
      if (!board) throw new ApiError(404, "not_found", `No use case ${slug} in this release. List the use cases at ${api("/use-cases/")}.`);
      return { html: board.use_case_href, data: boardData(board) };
    },
  },
  {
    path: "/contested/", id: "listContested", example: "/contested/?limit=5",
    summary: "List contested findings",
    description: "Findings in which studies disagree about the same models, most severe first. A finding is an automatic lead, not a finding of error, and never withholds a result.",
    query: {
      limit: limit(500, 50), cursor: CURSOR,
      status: choice("open for unsettled findings, settled for settled ones.", ["open", "settled"]),
      severity: choice("Only findings of this severity.", severities),
      system: text("Only findings that compare this model, method or configuration, by record id.", 255, RECORD_ID),
      listing: choice("public for the findings the release lists by default, review for those it lists for curation. Without it, both.", listings),
    },
    data: ContestedList,
    run: (_params, input) => {
      const { query } = buildCatalogue();
      const page = query.discrepancies({
        limit: (input.limit as number | undefined) ?? 50,
        ...(input.cursor ? { cursor: String(input.cursor) } : {}),
        ...(input.status ? { settled: input.status as "open" | "settled" } : {}),
        ...(input.severity ? { severity: String(input.severity) } : {}),
        ...(input.system ? { system: String(input.system) } : {}),
        ...(input.listing ? { listing: String(input.listing) } : {}),
      });
      return {
        html: "/contested/",
        page: { total: page.total, next_cursor: page.next_cursor },
        data: typed(ContestedList, {
          available: query.hasDiscrepancies(),
          counts: page.counts,
          findings: page.items.map((d) => ({ ...d, url: site(discrepancyHref(d.id)), api_url: api(`/contested/${d.id}/`) })),
        }),
      };
    },
  },
  {
    path: "/contested/{id}/", id: "getContested", example: null,
    summary: "One contested finding",
    description: "A finding with the studies it compares, their numbers, its follow-up actions, and links to the sources and results on each side.",
    pathParams: { id: "Finding id, as listed by /contested/. An earlier id of the same finding also works." },
    data: ContestedDetail,
    run: ({ id }) => {
      const finding = RECORD_ID.test(id) ? buildCatalogue().query.discrepancy(id) : null;
      if (!finding) throw new ApiError(404, "not_found", `No finding ${id} in this release. List the findings at ${api("/contested/")}.`);
      const find = lookup();
      const results = (ids: readonly string[]) => ids.map((result) => ({ id: result, url: site(recordHref({ kind: "result", id: result })) }));
      return {
        html: discrepancyHref(finding.id),
        data: typed(ContestedDetail, {
          url: site(discrepancyHref(finding.id)),
          finding,
          systems: finding.systems.flatMap((system) => {
            const record = find(system);
            return record ? [reference(record)] : [];
          }),
          sources: {
            outlier: sourceLinks(finding.outlier_sources, find),
            consensus: sourceLinks(finding.consensus_sources, find),
            party: sourceLinks(finding.party_sources, find),
          },
          results: {
            outlier: results(finding.outlier_results),
            consensus: results(finding.consensus_results),
            party: results(finding.party_results),
          },
        }),
      };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

const BASE_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, "Cache-Control": cache } });

const pattern = (path: string) => new RegExp(`^${path.replace(/\{([a-z]+)\}/g, "(?<$1>[^/]+)")}$`);
const routes = ENDPOINTS.map((endpoint) => ({ endpoint, match: pattern(endpoint.path) }));

function releaseBlock() {
  const pin = dataPin();
  const { catalogue } = buildCatalogue();
  return {
    id: catalogue.release_id,
    released_at: catalogue.released_at,
    repository: `https://github.com/${pin.repository}`,
    revision: pin.revision,
    manifest_url: site("/release-manifest.json"),
  };
}

function readQuery(url: URL, endpoint: Endpoint): Input {
  const specs: Record<string, Param> = { ...endpoint.query, release_id: RELEASE };
  const input: Input = {};
  for (const name of new Set(url.searchParams.keys())) {
    const spec = specs[name];
    // An unknown name is refused, not ignored: a misspelt filter must not answer unfiltered.
    if (!spec) throw new ApiError(400, "unknown_parameter", `Unknown query parameter ${JSON.stringify(name.slice(0, 60))}. This endpoint takes: ${Object.keys(specs).join(", ")}.`);
    const values = url.searchParams.getAll(name);
    if (values.length > 1) throw new ApiError(400, "invalid_parameter", `Query parameter ${name} is given more than once.`);
    try {
      input[name] = spec.parse(values[0]);
    } catch (error) {
      throw new ApiError(400, "invalid_parameter", `Query parameter ${name} ${error instanceof Error ? error.message : "is not valid"}.`);
    }
  }
  return input;
}

/** Answers one GET under /api/v1. Never throws: every failure is a JSON error that is not cached. */
export function handlePublicApi(request: Request): Response {
  const releaseId = buildCatalogue().catalogue.release_id;
  const fail = (error: ApiError) => json({
    error: { code: error.code, message: error.message },
    release: { id: releaseId },
    links: { docs: site(API_DOCS_PATH), openapi: api("/openapi.json") },
  }, error.status, "no-store");
  try {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(API_BASE)) throw new ApiError(404, "not_found", "Not part of this API.");
    const rest = url.pathname.slice(API_BASE.length) || "/";
    if (rest === "/openapi.json") {
      if (url.search) throw new ApiError(400, "unknown_parameter", "The OpenAPI description takes no query parameters.");
      return json(openApiDocument(), 200, API_CACHE_CONTROL);
    }
    const path = rest.endsWith("/") ? rest : `${rest}/`;
    const route = routes.map((r) => ({ ...r, found: r.match.exec(path) })).find((r) => r.found);
    if (!route) throw new ApiError(404, "not_found", `No endpoint ${API_BASE}${rest}. The endpoints are listed at ${api("/")}.`);
    const { endpoint } = route;
    const input = readQuery(url, endpoint);
    if (input.release_id !== undefined && input.release_id !== releaseId)
      throw new ApiError(404, "release_not_served", `Release ${input.release_id} is not served; the current release is ${releaseId}.`);
    let answer: Answer;
    try {
      answer = endpoint.run(route.found!.groups ?? {}, input);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // The readers refuse a cursor from another release or other filters, and say so.
      throw new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Invalid request");
    }
    const self = new URL(`${API_BASE}${path}`, SITE);
    for (const name of Object.keys(input).sort()) self.searchParams.set(name, String(input[name]));
    let page: z.infer<typeof PageShape> | undefined;
    if (answer.page) {
      const next = answer.page.next_cursor ? new URL(self) : null;
      next?.searchParams.set("cursor", answer.page.next_cursor!);
      page = { total: answer.page.total, next_cursor: answer.page.next_cursor, next_url: next?.href ?? null };
    }
    return json({
      release: releaseBlock(),
      licence: DATA_LICENCE,
      citation: releaseCitation(releaseId, SITE),
      links: { self: self.href, docs: site(API_DOCS_PATH), openapi: api("/openapi.json"), html: answer.html ? site(answer.html) : null },
      ...(page ? { page } : {}),
      data: answer.data,
    }, 200, API_CACHE_CONTROL);
  } catch (error) {
    if (error instanceof ApiError) return fail(error);
    throw error;
  }
}

/** The response schema of an endpoint: the envelope around its data. */
export const responseSchema = (endpoint: Endpoint) => envelope(endpoint.data, !!endpoint.query?.cursor);

// ---------------------------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------------------------

let openApi: unknown;

/** The OpenAPI 3.1 description, generated from ENDPOINTS. It describes the API, not a release. */
export function openApiDocument() {
  if (openApi) return openApi;
  const schema = (shape: z.ZodType) => {
    const { $schema: _, ...rest } = z.toJSONSchema(shape) as Record<string, unknown>;
    return rest;
  };
  const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
  const paths: Record<string, unknown> = {};
  for (const endpoint of ENDPOINTS) {
    const query: Record<string, Param> = { ...endpoint.query, release_id: RELEASE };
    paths[endpoint.path] = {
      get: {
        operationId: endpoint.id,
        summary: endpoint.summary,
        description: endpoint.description,
        parameters: [
          ...Object.entries(endpoint.pathParams ?? {}).map(([name, description]) => ({
            name, in: "path", required: true, description, schema: { type: "string", pattern: RECORD_ID.source },
          })),
          ...Object.entries(query).map(([name, param]) => ({ name, in: "query", required: false, description: param.description, schema: param.schema })),
        ],
        responses: {
          200: {
            description: "The answer, with the release it was read from, the data licence and a citation.",
            headers: { "X-Rewire-Data-Release": { description: "The release the answer was read from.", schema: { type: "string" } } },
            content: { "application/json": { schema: schema(responseSchema(endpoint)) } },
          },
          400: errorResponse("A query parameter is unknown or not valid, or a cursor does not match the release and filters."),
          404: errorResponse("No such record in this release, or the request pins a release that is not the one served."),
        },
      },
    };
  }
  paths["/openapi.json"] = {
    get: {
      operationId: "getOpenApi",
      summary: "This description",
      responses: { 200: { description: "The OpenAPI 3.1 description of this API.", content: { "application/json": { schema: { type: "object" } } } } },
    },
  };
  return (openApi = {
    openapi: "3.1.0",
    info: {
      title: `${DATABASE_NAME} API`,
      version: API_VERSION,
      summary: "Keyless, read-only JSON over the release the site serves.",
      description: [
        "Every answer is read from one pinned data release and names it in release.id. A new release replaces the old one at the same addresses; pass release_id to refuse an answer from any other release.",
        "Models are ranked per use case, on one protocol and one metric at a time. There is no composite score. A proxy protocol is labelled in protocol.relevance.",
        "A result is reproduced only when it cites a run receipt in the release. source_checked means the value was checked against the source it cites, not that it was rerun.",
        `Data licence: ${DATA_LICENCE.statement} Each answer repeats the licence position in its licence field.`,
        "No key is needed and nothing is written. Use GET. Addresses end in a slash; an address without one is redirected.",
      ].join("\n\n"),
    },
    externalDocs: { description: "API docs", url: site(API_DOCS_PATH) },
    servers: [{ url: `${SITE}${API_BASE}` }],
    paths,
    components: { schemas: { Error: schema(ErrorShape) } },
  });
}
