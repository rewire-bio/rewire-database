/** Declared record attributes (issue #42, stage 3).
 *
 * Every attribute key a record may carry is declared per kind in attribute-registry.ts with a
 * type from attributeTypes below; validateAttributes rejects undeclared keys and badly typed
 * values. Missing values are never bare nulls: the key is absent and missing_metadata gives a
 * reason from the missingness scheme (data/vocab/missingness.ttl).
 *
 * Until October 2026 attributes were an open bag. normalizeAttributes turns records written
 * before then into the declared shapes, so older releases stay readable and the rest of the
 * code only sees current shapes. The store migration uses the same function, with a reviewed
 * table for free-text missing reasons (data/vocab/migration/missingness.csv). */
import { z } from "zod";
import { attributeRegistry } from "./attribute-registry.js";
import { entityKinds } from "./entity-kinds.js";

export const missingReasons = ["unreported", "unextracted", "unavailable", "inapplicable", "conflicting"] as const;
export type MissingReason = (typeof missingReasons)[number];
export const uncertaintyTypes = [
  "standard_deviation",
  "standard_error",
  "confidence_interval",
  "credible_interval",
  "unresolved_spread",
] as const;

const text = z.string().min(1);
const decimal = z.string().regex(/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/, "Expected a decimal string");
const integer = z.number().int();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date (YYYY-MM-DD)");
const dateTime = z.string().datetime({ offset: true });
const recordId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,254}$/);
const json = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

export const missingEntrySchema = z.object({ reason: z.enum(missingReasons), note: text.optional() }).strict();
export const missingMetadataSchema = z
  .record(z.string(), missingEntrySchema)
  .refine((value) => Object.keys(value).length > 0, "Omit an empty missing_metadata map");

export const uncertaintySchema = z
  .object({
    type: z.enum(uncertaintyTypes),
    printed: text.optional(),
    value: decimal.optional(),
    half_width: decimal.optional(),
    lower: decimal.optional(),
    upper: decimal.optional(),
    center: decimal.optional(),
    level: z.number().gt(0).lt(1).optional(),
    method: z.enum(["bootstrap", "bootstrap_percentile", "analytic", "propagated"]).optional(),
    n: integer.positive().optional(),
    resamples: integer.positive().optional(),
    scope: text.optional(),
    unit: text.optional(),
    source_column: text.optional(),
    note: text.optional(),
  })
  .strict()
  .superRefine((u, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const interval = u.type === "confidence_interval" || u.type === "credible_interval";
    if (interval && u.lower === undefined && u.half_width === undefined)
      fail(`${u.type} needs lower and upper bounds or a half-width`);
    if ((u.lower === undefined) !== (u.upper === undefined)) fail("Give both interval bounds");
    if (!interval && u.value === undefined) fail(`${u.type} needs a value`);
    if (!interval && (u.lower !== undefined || u.half_width !== undefined || u.level !== undefined))
      fail(`${u.type} cannot have interval bounds or a level`);
  });

export const coverageSchema = z
  .object({
    scored: integer.nonnegative().optional(),
    eligible: integer.nonnegative().optional(),
    unit: text.optional(),
    generated_per_run: integer.positive().optional(),
    repeats: integer.positive().optional(),
    note: text.optional(),
  })
  .strict();

export const reviewSchema = z
  .object({
    method: z.array(text).min(1),
    reviewer: z.array(text).min(1).optional(),
    date: date.optional(),
    reviewed_at: dateTime.optional(),
    scope: text.optional(),
    note: text.optional(),
    method_note: text.optional(),
    reviewer_note: text.optional(),
    evidence: text.optional(),
    source_id: recordId.optional(),
    receipt: text.optional(),
    artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    retrieval_url: z.string().url().optional(),
  })
  .strict();

export const reportedPopulationSchema = z
  .object({
    count: integer.nonnegative().optional(),
    unit: text.optional(),
    train_validation_test: z.tuple([integer, integer, integer]).optional(),
    note: text.optional(),
  })
  .strict();

/** The type each declared attribute may take. `concept:<scheme>` values are concept keys,
 * checked against the scheme by the vocabulary validator; `json` is a structured payload
 * whose shape is checked by its own validator or carried as an rdf:JSON literal. */
export const attributeTypes = {
  text,
  integer,
  number: z.number(),
  boolean: z.boolean(),
  decimal,
  "decimal-or-null": decimal.nullable(),
  date,
  datetime: z.union([dateTime, date]),
  url: z.string().url(),
  "url-or-path": z.union([z.string().url(), z.string().regex(/^\/[\w./-]+$/)]),
  doi: z.string().regex(/^10\.\d{4,9}\/\S+$/, "Expected a bare DOI (10.xxxx/...)"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  "git-sha": z.string().regex(/^[a-f0-9]{7,40}$/),
  "record-id": recordId,
  "record-ids": z.array(recordId),
  "entity-kinds": z.array(z.enum(entityKinds)),
  texts: z.array(text),
  concept: text,
  concepts: z.array(text),
  json,
  "missing-metadata": missingMetadataSchema,
  uncertainty: uncertaintySchema,
  coverage: coverageSchema,
  review: reviewSchema,
  "reported-population": reportedPopulationSchema,
} as const;
export type AttributeType = keyof typeof attributeTypes | `concept:${string}` | `concepts:${string}`;

const schemaFor = (type: string) =>
  attributeTypes[(type.startsWith("concept:") ? "concept" : type.startsWith("concepts:") ? "concepts" : type) as keyof typeof attributeTypes];

type Rec = { id: string; kind: string; links: { relation: string; target_id: string }[]; attributes: Record<string, unknown> };

/** Problems with a record's attributes; empty when they match the registry. */
export function attributeIssues(record: Rec): string[] {
  const declared = (attributeRegistry as Record<string, Record<string, string>>)[record.kind] ?? {};
  const issues: string[] = [];
  for (const [key, value] of Object.entries(record.attributes)) {
    const type = declared[key];
    if (!type) {
      issues.push(`undeclared attribute ${key}`);
      continue;
    }
    if (value === null && !(type === "decimal-or-null")) {
      issues.push(`${key} is null; omit it and give a reason in missing_metadata`);
      continue;
    }
    const parsed = schemaFor(type).safeParse(value);
    if (!parsed.success) issues.push(`${key} is not ${type}: ${parsed.error.issues[0]?.message}`);
  }
  const missing = record.attributes.missing_metadata as Record<string, unknown> | undefined;
  if (missing && typeof missing === "object")
    for (const key of Object.keys(missing)) {
      if (key in record.attributes && key !== "missing_metadata")
        issues.push(`${key} has a value and a missing_metadata reason`);
      if (!declared[key.split(".")[0]]) issues.push(`missing_metadata names undeclared field ${key}`);
    }
  return issues;
}

export function validateAttributes(records: Rec[]): void {
  const problems = records.flatMap((record) => attributeIssues(record).map((issue) => `${record.kind} ${record.id}: ${issue}`));
  if (problems.length)
    throw new Error(`${problems.length} attribute problems:\n${problems.slice(0, 20).join("\n")}${problems.length > 20 ? "\n..." : ""}`);
}

// ---- Conversion of records written before October 2026 ----

/** Attributes moved to data/provenance/moved-attributes.jsonl by the migration; readers drop them. */
export const movedAttributes = [
  "acquisition_candidate_id",
  "legacy_row",
  "legacy_paper",
  "legacy_import_source_id",
  "local_cache_path",
  "historical_entity_links",
  "historical_missing_metadata",
] as const;

/** Constant scaffolding with no meaning beyond the record's kind or the field definition. */
const dropped: Record<string, readonly string[]> = {
  "*": ["metadata_review_scope", "benchmark_applicability", "published_score_reproduction", "suite_complete"],
  configuration: ["reference_kind", "entity_level"],
  dataset: ["entity_level"],
  dataset_subset: ["entity_level"],
  evaluator: ["entity_level"],
  pipeline: ["entity_level"],
  protocol: ["entity_level"],
  task: ["entity_level"],
  evaluation: ["evaluation_group_note", "publication_status"],
  benchmark: ["publication_status"],
};

const renamed: Record<string, Record<string, string>> = {
  result: { source_printed_cell: "printed_source_cell" },
  source: { article_license: "article_licence", code_license: "code_licence", license: "licence", locator: "source_locator", sha256: "artifact_sha256" },
  dataset: { scope: "scope_note" },
  dataset_subset: { dataset_id: "recipe_dataset_id" },
  configuration: { family: "family_label", foundation_model: "foundation_model_eligible" },
  method: { family: "family_label" },
};

/** Result attributes that only repeat the parent evaluation's value. evidence_experiment_set_id also
 * repeats it but stays, because claims cite it on the result. */
const copiedFromEvaluation = ["same_paper_experiment_set", "total_targets", "missing_count", "evidence_overlap"];

/** Null attributes that mean "none" rather than "missing". */
const nullMeansNone = new Set(["source_discrepancy", "undefined_reason"]);

const tokenReasons: Record<string, MissingReason> = {
  unreported: "unreported",
  unextracted: "unextracted",
  unavailable: "unavailable",
  inapplicable: "inapplicable",
  conflicting: "conflicting",
};

/** Reason for a free-text missing note when no reviewed table is given: a keyword rule. */
function guessReason(note: string): MissingReason {
  const t = note.toLowerCase();
  if (/not[_ ]applicable|inapplicable/.test(t)) return "inapplicable";
  if (/inaccessible|not exposed|unpublished/.test(t)) return "unavailable";
  if (/unextracted|not extracted|not[_ ]yet[_ ]extracted|not established|legacy/.test(t)) return "unextracted";
  return "unreported";
}

export type MissingLookup = Map<string, { reason: MissingReason | "not_missing"; keepNote: boolean }>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const decimalString = (value: unknown): string | undefined =>
  typeof value === "number" ? String(value) : typeof value === "string" && decimal.safeParse(value.trim()).success ? value.trim() : undefined;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function missingEntry(value: unknown, lookup?: MissingLookup): { reason: MissingReason; note?: string } | null {
  if (isObject(value) && typeof value.reason === "string") return value as { reason: MissingReason; note?: string };
  if (typeof value !== "string" || !value.trim()) return { reason: "unextracted" };
  const token = tokenReasons[value];
  if (token) return { reason: token };
  const row = lookup?.get(value);
  if (row?.reason === "not_missing") return null;
  if (row) return row.keepNote ? { reason: row.reason, note: value } : { reason: row.reason };
  return { reason: guessReason(value), note: value };
}

/** Convert one uncertainty value to the declared shape, or return a missing reason. */
export function convertUncertainty(raw: unknown): { uncertainty?: Record<string, unknown>; missing?: { reason: MissingReason; note?: string } } {
  if (raw === undefined) return {};
  if (raw === null) return { missing: { reason: "unextracted" } };
  if (typeof raw === "string") {
    const ci = raw.match(/^95% CI ([\d.]+)%?[–-]([\d.]+)%?/);
    if (ci) {
      const resamples = raw.match(/([\d,]+) bootstrap replicates/);
      return {
        uncertainty: {
          type: "confidence_interval", printed: raw, lower: ci[1], upper: ci[2], level: 0.95,
          ...(resamples ? { method: "bootstrap", resamples: Number(resamples[1].replace(/,/g, "")) } : {}),
        },
      };
    }
    const pm = raw.match(/^±\s*([\d.]+)(.*)$/);
    if (pm) {
      const rest = pm[2].trim();
      const sd = /standard deviation/.test(rest);
      return {
        uncertainty: {
          type: sd ? "standard_deviation" : "unresolved_spread", printed: raw, value: pm[1],
          ...(rest && !sd ? { note: rest } : {}),
        },
      };
    }
    return { missing: { reason: "unreported", note: raw } };
  }
  if (!isObject(raw)) return {};
  const u = { ...raw };
  if (u.status === "unreported" || (u.type === "unreported" && u.value === undefined && u.reported_spread === undefined && u.printed_spread === undefined))
    return { missing: { reason: "unreported", ...(typeof u.note === "string" ? { note: u.note } : {}) } };
  if (uncertaintySchema.safeParse(u).success) return { uncertainty: u };
  const type = String(u.type ?? u.kind ?? "");
  const out: Record<string, unknown> = {};
  const note = typeof u.note === "string" ? u.note : undefined;
  if (/bootstrap_summary/.test(type)) Object.assign(out, { type: "standard_deviation", method: "bootstrap", value: u.printed_sd, center: u.printed_mean });
  else if (/standard_deviation/.test(type)) Object.assign(out, { type: "standard_deviation", value: u.value ?? u.reported_spread ?? u.printed_value });
  else if (/standard_error/.test(type)) Object.assign(out, {
      type: "standard_error", value: u.value ?? u.reported_spread ?? u.printed_value,
      method: /propagated/.test(type) ? "propagated" : undefined,
    });
  else if (/confidence.interval/.test(type)) {
    const level = typeof u.level === "string" ? Number(u.level.replace("%", "")) / 100 : (u.level ?? u.confidence_level);
    Object.assign(out, {
      type: "confidence_interval", level, lower: u.lower ?? u.low, upper: u.upper ?? u.high, half_width: u.reported_half_width,
      resamples: u.resamples ?? u.replicates,
      method: /percentile/.test(type) ? "bootstrap_percentile" : /bootstrap/.test(type) ? "bootstrap" : undefined,
    });
  } else Object.assign(out, { type: "unresolved_spread", value: u.value ?? u.printed_spread ?? u.reported_spread ?? u.printed_value });
  for (const key of ["value", "lower", "upper", "half_width", "center"]) out[key] = decimalString(out[key]);
  const printed = u.printed ?? u.printed_spread;
  if (typeof printed === "string") out.printed = printed;
  if (typeof u.n === "number") out.n = u.n;
  if (typeof u.scope === "string" || typeof u.aggregation === "string") out.scope = u.scope ?? u.aggregation;
  if (typeof u.unit === "string" && u.unit !== "same_as_metric") out.unit = u.unit;
  if (typeof u.source_column === "string") out.source_column = u.source_column;
  if (out.type === "unresolved_spread" && out.value === undefined)
    return { missing: { reason: "unreported", ...(typeof printed === "string" ? { note: `printed spread "${printed}"` } : {}) } };
  const typeNote = out.type === "unresolved_spread" && !["unreported", "reported_plus_minus_type_unresolved"].includes(type) ? type : undefined;
  if (note || typeNote) out.note = [typeNote, note].filter(Boolean).join(". ");
  return { uncertainty: Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) };
}

function convertCoverage(raw: unknown, missing: Record<string, unknown>): Record<string, unknown> | undefined {
  if (typeof raw === "string") {
    const m = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) return { scored: Number(m[1]), eligible: Number(m[2]) };
    return { note: raw };
  }
  if (!isObject(raw)) return undefined;
  const out = { ...raw };
  for (const key of ["scored", "eligible"])
    if (typeof out[key] === "string") {
      if (/^\d+$/.test(out[key] as string)) out[key] = Number(out[key]);
      else {
        missing[`coverage.${key}`] ??= missingEntry(out[key]);
        delete out[key];
      }
    }
  return out;
}

function convertReview(raw: unknown): Record<string, unknown> | undefined {
  if (!isObject(raw)) return undefined;
  const r = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "" && v !== null));
  const list = (value: unknown) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);
  r.method = list(r.method);
  const reviewers = [...(list(r.reviewer) ?? []), ...(list(r.actor) ?? [])];
  delete r.actor;
  if (reviewers.length) r.reviewer = [...new Set(reviewers)];
  if (typeof r.notes === "string") {
    r.note = typeof r.note === "string" && r.note !== r.notes ? `${r.note}\n\n${r.notes}` : r.notes;
    delete r.notes;
  }
  if (typeof r.reviewed_at === "string" && date.safeParse(r.reviewed_at).success) {
    if (r.date === undefined || r.date === r.reviewed_at) {
      r.date = r.reviewed_at;
      delete r.reviewed_at;
    }
  }
  if (typeof r.reviewed_at === "string" && r.date === r.reviewed_at.slice(0, 10)) delete r.date;
  return r;
}

function sourceReviewMethod(value: unknown): { method: string; method_note?: string } {
  const text = String(value);
  if (text === "automated_source_review") return { method: "automated-source-review" };
  return { method: /^AI-assisted/.test(text) ? "ai-assisted-source-review" : "automated-source-review", method_note: text };
}

/** Convert one record's attributes to the declared shapes. `records` resolves parents. */
function convert(record: Rec, index: Index, lookup?: MissingLookup): Record<string, unknown> {
  const { byId, evaluationsBySystem } = index;
  const a: Record<string, unknown> = { ...record.attributes };
  const kind = record.kind;
  for (const key of [...movedAttributes, ...(dropped["*"] ?? []), ...(dropped[kind] ?? [])]) delete a[key];
  for (const [from, to] of Object.entries(renamed[kind] ?? {}))
    if (from in a) {
      if (to in a && !sameJson(a[to], a[from])) throw new Error(`${record.id}: ${from} and ${to} differ`);
      if (!(to in a)) a[to] = a[from];
      delete a[from];
    }

  // Missing-value markers: one map of field to {reason, note?}.
  const missing: Record<string, unknown> = {};
  if (isObject(a.missing_metadata))
    for (const [key, value] of Object.entries(a.missing_metadata)) {
      const entry = missingEntry(value, lookup);
      if (entry) missing[key] = entry;
    }

  // Merged copies.
  if (["method", "model", "service"].includes(kind)) delete a.method_type; // repeats facets.method_types
  if (kind === "protocol") {
    const extra = [a.caveats, a.important_limitation].flat().filter((x): x is string => typeof x === "string");
    if (extra.length) a.limitations = [...(Array.isArray(a.limitations) ? a.limitations : a.limitations ? [a.limitations] : []), ...extra];
    delete a.caveats;
    delete a.important_limitation;
    const notes = { definition: a.uncertainty_definition, mechanism: a.uncertainty_mechanism, note: a.uncertainty_note };
    if (Object.values(notes).some((v) => v !== undefined))
      a.uncertainty_reporting = Object.fromEntries(Object.entries(notes).filter(([, v]) => v !== undefined));
    delete a.uncertainty_definition;
    delete a.uncertainty_mechanism;
    delete a.uncertainty_note;
    if (typeof a.uncertainty === "string") {
      missing.uncertainty = { reason: "unreported", note: a.uncertainty };
      delete a.uncertainty;
    }
    if (isObject(a.procedure)) {
      a.protocol_configuration = a.procedure;
      delete a.procedure;
    }
  }
  if (kind === "evaluation") {
    if (isObject(a.protocol)) {
      const p = a.protocol;
      a.protocol = p.name;
      if (p.version !== undefined) a.protocol_version = p.version;
      if (p.proposed_id !== undefined) a.proposed_protocol_id = p.proposed_id;
    }
    if (typeof a.run_url === "string") {
      if (a.run_url === a.reproduction_url) delete a.run_url;
      else if (a.run_url.startsWith("/")) {
        a.run_page = a.run_url;
        delete a.run_url;
      }
    }
    const system = record.links.find((l) => l.relation === "system");
    const configuration = system && byId.get(system.target_id);
    if (configuration && sameJson(configuration.attributes.configuration, a.model_configuration)) delete a.model_configuration;
  }
  if (kind === "configuration") {
    const evaluations = evaluationsBySystem.get(record.id) ?? [];
    if (a.execution !== undefined && evaluations.length && evaluations.every((e) => sameJson(e.attributes.execution, a.execution)))
      delete a.execution;
  }
  if (kind === "dataset" && isObject(a.population)) {
    a.population_detail = a.population;
    delete a.population;
  }
  if (isObject(a.reported_population)) {
    const population = Object.fromEntries(Object.entries(a.reported_population).filter(([, v]) => v !== null));
    if (population.count === undefined && population.train_validation_test === undefined) {
      delete a.reported_population;
      missing.reported_population ??= { reason: "unextracted", ...(typeof population.note === "string" ? { note: population.note } : {}) };
    } else a.reported_population = population;
  }
  if (typeof a.derived_normalized_value === "number") a.derived_normalized_value = String(a.derived_normalized_value);
  if (kind === "result") {
    const parentLink = record.links.find((l) => l.relation === "evaluation");
    const parent = parentLink && byId.get(parentLink.target_id);
    for (const key of copiedFromEvaluation)
      if (key in a && parent && sameJson(parent.attributes[key], a[key])) delete a[key];
    if (a.source_uncertainty_note !== undefined) {
      const note = a.source_uncertainty_note;
      delete a.source_uncertainty_note;
      if (isObject(a.uncertainty)) a.uncertainty = { ...a.uncertainty, note: [a.uncertainty.note, note].filter(Boolean).join(". ") };
      else missing.uncertainty = { ...((missing.uncertainty as object) ?? { reason: "unreported" }), note };
    }
    const { uncertainty, missing: reason } = convertUncertainty(a.uncertainty);
    delete a.uncertainty;
    if (uncertainty) {
      a.uncertainty = uncertainty;
      delete missing.uncertainty; // a stated value overrides a stale marker
    } else if (reason && !missing.uncertainty) missing.uncertainty = reason;
  }
  if (a.coverage !== undefined) {
    const coverage = convertCoverage(a.coverage, missing);
    if (coverage && Object.keys(coverage).length) a.coverage = coverage;
    else delete a.coverage;
  }
  if (a.review !== undefined) a.review = convertReview(a.review);
  if (kind === "source" && (a.review_method !== undefined || a.review_scope !== undefined)) {
    const review = (isObject(a.review) ? a.review : {}) as Record<string, unknown>;
    if (a.review_method !== undefined) {
      const { method, method_note } = sourceReviewMethod(a.review_method);
      review.method = [...new Set([...((review.method as string[]) ?? []), method])];
      if (method_note) review.method_note = review.method_note ? `${review.method_note}\n\n${method_note}` : method_note;
    }
    if (a.review_scope !== undefined) review.scope = a.review_scope;
    review.method ??= ["automated-source-review"];
    a.review = review;
    delete a.review_method;
    delete a.review_scope;
  }

  // Bare nulls become absence; the reason, if not already given, is "unextracted".
  for (const [key, value] of Object.entries(a)) {
    if (value !== null || key === "numeric_value") continue;
    delete a[key];
    if (!nullMeansNone.has(key)) missing[key] ??= { reason: "unextracted" };
  }
  for (const key of Object.keys(missing)) if (key in a) delete missing[key];
  delete a.missing_metadata;
  if (Object.keys(missing).length) a.missing_metadata = Object.fromEntries(Object.entries(missing).sort(([x], [y]) => (x < y ? -1 : 1)));
  // Keep the original key order so unchanged records keep their bytes; new keys go last.
  const order = [...Object.keys(record.attributes).filter((key) => key in a), ...Object.keys(a).filter((key) => !(key in record.attributes))];
  return Object.fromEntries(order.map((key) => [key, a[key]]));
}

type Index = { byId: Map<string, Rec>; evaluationsBySystem: Map<string, Rec[]> };

/** Records with attributes in the declared shapes. Unchanged records are returned as they are. */
export function normalizeAttributes<T extends Rec>(records: T[], lookup?: MissingLookup): T[] {
  const byId = new Map<string, Rec>(records.map((record) => [record.id, record]));
  const evaluationsBySystem = new Map<string, Rec[]>();
  for (const record of records)
    if (record.kind === "evaluation")
      for (const link of record.links)
        if (link.relation === "system") evaluationsBySystem.set(link.target_id, [...(evaluationsBySystem.get(link.target_id) ?? []), record]);
  return records.map((record) => {
    const attributes = convert(record, { byId, evaluationsBySystem }, lookup);
    return sameJson(attributes, record.attributes) ? record : { ...record, attributes };
  });
}
