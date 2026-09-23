#!/usr/bin/env node
/** Read-only immutable-release presentation inventory. No HTTP requests or source verification.
 * Usage: node audit-display-data.mjs --release-dir DIR --output NEW_DIRECTORY
 * Refuses to overwrite an output directory. Regex matches are candidates, not data errors.
 * Typed evidence is parsed once from value_json; inner source strings are never parsed again.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import crypto from "node:crypto";
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--release-dir", "--output"].includes(args[i]) || !args[i + 1])
    throw new Error("Usage: --release-dir DIR --output NEW_DIRECTORY");
  options[args[i].slice(2)] = args[i + 1];
}
if (!options["release-dir"] || !options.output)
  throw new Error("Both --release-dir and --output are required");
const dir = path.resolve(options["release-dir"]);
const out = path.resolve(options.output);
if (fs.existsSync(out)) throw new Error(`Refusing to overwrite ${out}`);
const cataloguePath = path.join(dir, "catalogue.json.gz");
const evidencePath = path.join(dir, "evidence.jsonl.gz");
const catalogueBytes = fs.readFileSync(cataloguePath);
const catalogue = JSON.parse(zlib.gunzipSync(catalogueBytes));
const records = catalogue.records;
const byId = new Map(records.map((r) => [r.id, r]));
const sum = (o, k, n = 1) => {
  o[k] = (o[k] || 0) + n;
};
const normalize = (p) => p.replace(/\.\d+(?=\.|$)/g, ".*");
const knownCondition =
  /\{\s*"reference_network"\s*:\s*"[^"\n]*"\s*,\s*"gene_selection"\s*:\s*"[^"\n]*"\s*\}/;
const conditionKind = (v, p) =>
  knownCondition.test(v)
    ? "populated-condition"
    : (v === "{}" && p === "attributes.comparison.inputs") ||
        /^BEELINE 2020 Figure [24] · .* · \{\}(?::|$)/.test(v) ||
        /^Source-specific evaluation\. Input conditions: \{\}\./.test(v)
      ? "empty-condition"
      : null;
const narrativeFields = new Set([
  "attributes.profile.diagram.steps",
  "attributes.profile.gaps",
  "attributes.benchmark_research.gaps",
]);
const patterns = {
  empty_json_object: /\{\s*\}/,
  empty_json_array: /\[\s*\]/,
  json_object: /\{\s*"[^"\n]+"\s*:/,
  json_array: /\[\s*(?:\{|"[^"\n]*"\s*[,\]])/,
  object_coercion: /\[object (?:Object|Array|Promise|Undefined)\]/,
  undefined_token: /\bundefined\b/,
  nonfinite_token: /(?<![A-Za-z])(?:NaN|Infinity|-Infinity)(?![A-Za-z])/,
  null_token: /\bnull\b/,
  html_entity: /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);/,
  html_tag: /<\/?(?:p|br|div|span|sup|sub|a|strong|em|table|td|tr)\b[^>]*>/,
  literal_newline: /\\[nr]/,
  replacement_character: /\ufffd/,
  control_character: /[\x00-\x08\x0b\x0c\x0e-\x1f]/,
  markdown_link: /\[[^\]\n]+\]\((?:https?:\/\/|\/)/,
};
const summary = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  release_id: catalogue.release_id,
  scope:
    "Every catalogue string leaf and record reference; every typed evidence row; URL-field syntax only. No HTTP link health, browser verification, scientific source re-verification, or mutation.",
  records: records.length,
  string_fields: 0,
  record_kinds: {},
  candidate_counts: {},
  candidate_field_groups: {},
  condition_fields: {},
  condition_forms: {},
  empty_direct_attribute_objects: 0,
  valid_undefined_scores: 0,
  result_numeric_types: {},
  catalogue_url_counts: {},
  evidence_url_counts: {},
  evidence_rows: 0,
  evidence_value_types: {},
  structured_evidence_fields: {},
  narrative_evidence_fields: {},
  evidence_condition_strings: 0,
  evidence_condition_forms: {},
  integrity_errors: 0,
  source_verification:
    "Unchanged; prior reviewed source claims are not reverified by this presentation audit.",
};
const candidates = [],
  conditions = [],
  emptyObjects = [],
  validUndefined = [],
  issues = [],
  urls = [];
const states = new Map(
  records.map((r) => [
    r.id,
    {
      id: r.id,
      kind: r.kind,
      condition_strings: 0,
      empty_attribute_objects: 0,
      narrative_evidence_rows: 0,
      structured_evidence_rows: 0,
      valid_undefined_score: 0,
      integrity_errors: 0,
    },
  ]),
);
const issue = (r, field, reason, value) => {
  issues.push({ record_id: r?.id || "", field, reason, value });
  sum(summary, "integrity_errors");
  if (states.has(r?.id)) sum(states.get(r.id), "integrity_errors");
};
if (byId.size !== records.length)
  issue(null, "id", "duplicate_record_ids", records.length - byId.size);
function classifyUrl(value, p) {
  if (typeof value !== "string")
    return value == null ? "missing-null" : "invalid-type";
  if (
    /(?:^|\.)missing_metadata\./.test(p) &&
    /^(?:unextracted|unreported|unavailable|unknown)$/.test(value)
  )
    return "missing-metadata-note";
  if (!value) return "missing-empty";
  if (/\s/.test(value)) return "invalid-whitespace";
  try {
    const u = new URL(value, "https://audit.invalid");
    if (value.startsWith("/") && !value.startsWith("//"))
      return "valid-root-relative";
    if (!/^https?:\/\//.test(value)) return "unsupported-scheme-or-relative";
    return ["http:", "https:"].includes(u.protocol) && u.hostname
      ? "valid-http"
      : "invalid-url";
  } catch {
    return "invalid-url";
  }
}
function urlCheck(value, p, r, evidence = false) {
  const classification = classifyUrl(value, p);
  sum(
    evidence ? summary.evidence_url_counts : summary.catalogue_url_counts,
    classification,
  );
  if (
    evidence &&
    ["missing-empty", "valid-http", "valid-root-relative"].includes(
      classification,
    )
  )
    return;
  urls.push({
    record_id: r.id,
    path: p,
    value,
    classification,
    source: evidence ? "evidence" : "catalogue",
  });
  if (
    ![
      "valid-http",
      "valid-root-relative",
      "missing-metadata-note",
      "missing-null",
      "missing-empty",
    ].includes(classification)
  )
    issue(r, p, "malformed_url_syntax", value);
}
function walk(v, p, r) {
  if (typeof v === "string") {
    summary.string_fields++;
    for (const [kind, rx] of Object.entries(patterns))
      if (rx.test(v)) {
        sum(summary.candidate_counts, kind);
        summary.candidate_field_groups[kind] ||= {};
        sum(summary.candidate_field_groups[kind], `${r.kind}:${normalize(p)}`);
        const classification = conditionKind(v, p)
          ? "known-condition-presentation"
          : p === "attributes.review.evidence"
            ? "literal-source-audit-evidence"
            : /(?:\.code|\.shell)$/.test(p)
              ? "literal-executable-instruction"
              : kind === "undefined_token" &&
                  p === "attributes.printed_value" &&
                  r.attributes?.undefined_reason
                ? "valid-undefined-measurement"
                : "candidate-requires-context";
        candidates.push({
          record_id: r.id,
          record_kind: r.kind,
          path: p,
          kind,
          classification,
          value: v,
        });
      }
    if (conditionKind(v, p)) {
      conditions.push({
        record_id: r.id,
        kind: r.kind,
        path: p,
        value: v,
        form: conditionKind(v, p),
      });
      sum(summary.condition_forms, conditionKind(v, p));
      sum(summary.condition_fields, `${r.kind}:${normalize(p)}`);
      sum(states.get(r.id), "condition_strings");
    }
  } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}.${i}`, r));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      const field = p ? `${p}.${k}` : k;
      if (/(?:^|_)(?:url|uri|href|website)$/.test(k)) urlCheck(x, field, r);
      walk(x, field, r);
    }
}
for (const r of records) {
  sum(summary.record_kinds, r.kind);
  for (const field of ["id", "kind", "name", "description"])
    if (
      typeof r[field] !== "string" ||
      (field !== "description" && !r[field].trim())
    )
      issue(r, field, "invalid_display_field_type_or_empty_label", r[field]);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(r.id))
    issue(r, "id", "invalid_record_id", r.id);
  for (const link of r.links || [])
    if (!byId.has(link.target_id))
      issue(r, "links", "dangling_record_link", link);
  for (const id of r.source_ids || [])
    if (!byId.has(id)) issue(r, "source_ids", "dangling_source_id", id);
  for (const [k, v] of Object.entries(r.attributes || {}))
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !Object.keys(v).length
    ) {
      emptyObjects.push({
        record_id: r.id,
        kind: r.kind,
        path: `attributes.${k}`,
      });
      sum(summary, "empty_direct_attribute_objects");
      sum(states.get(r.id), "empty_attribute_objects");
    }
  if (r.kind === "result") {
    const a = r.attributes || {},
      v = a.numeric_value;
    sum(summary.result_numeric_types, v === null ? "null" : typeof v);
    for (const f of ["printed_value", "metric", "unit"])
      if (typeof a[f] !== "string")
        issue(r, `attributes.${f}`, "invalid_result_display_type", a[f]);
    if (
      v !== null &&
      !(typeof v === "number" && Number.isFinite(v)) &&
      !(
        typeof v === "string" &&
        /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(v)
      )
    )
      issue(r, "attributes.numeric_value", "invalid_numeric_value", v);
    if (
      a.printed_value === "undefined" &&
      v === null &&
      typeof a.undefined_reason === "string" &&
      a.undefined_reason
    ) {
      validUndefined.push({
        record_id: r.id,
        printed_value: a.printed_value,
        undefined_reason: a.undefined_reason,
      });
      summary.valid_undefined_scores++;
      states.get(r.id).valid_undefined_score = 1;
    }
  }
  walk(r, "", r);
}
const input = fs.createReadStream(evidencePath).pipe(zlib.createGunzip());
for await (const line of readline.createInterface({
  input,
  crlfDelay: Infinity,
})) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  summary.evidence_rows++;
  const r = byId.get(row.record_id) || { id: row.record_id };
  if (!byId.has(row.record_id))
    issue(r, "evidence.record_id", "dangling_evidence_record", row.row_id);
  for (const f of ["source_id", "claim_id"])
    if (row[f] && !byId.has(row[f]))
      issue(r, `evidence.${f}`, "dangling_evidence_reference", row[f]);
  if (row.source_id && !row.source_title?.trim())
    issue(r, "evidence.source_title", "empty_linked_source_title", row.row_id);
  for (const f of ["source_url", "artifact_url", "extraction_artifact_url"])
    urlCheck(row[f], `evidence.${f}`, r, true);
  let v;
  try {
    if (typeof row.value_json !== "string")
      throw new Error("value_json is not a string");
    v = JSON.parse(row.value_json);
  } catch (e) {
    issue(
      r,
      "evidence.value_json",
      `invalid_typed_json: ${e.message}`,
      row.row_id,
    );
    continue;
  }
  const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  sum(summary.evidence_value_types, type);
  if (type === "array" || type === "object") {
    sum(summary.structured_evidence_fields, row.field_path);
    if (states.has(r.id)) sum(states.get(r.id), "structured_evidence_rows");
    if (narrativeFields.has(row.field_path)) {
      sum(summary.narrative_evidence_fields, row.field_path);
      if (states.has(r.id)) sum(states.get(r.id), "narrative_evidence_rows");
    }
  }
  if (typeof v === "string" && conditionKind(v, row.field_path)) {
    summary.evidence_condition_strings++;
    sum(summary.evidence_condition_forms, conditionKind(v, row.field_path));
  }
}
async function sha(file) {
  const hash = crypto.createHash("sha256");
  for await (const b of fs.createReadStream(file)) hash.update(b);
  return hash.digest("hex");
}
summary.files = {};
for (const file of [cataloguePath, evidencePath])
  summary.files[path.basename(file)] = {
    sha256: await sha(file),
    compressed_bytes: fs.statSync(file).size,
  };
summary.condition_records = new Set(conditions.map((x) => x.record_id)).size;
summary.narrative_records = [...states.values()].filter(
  (x) => x.narrative_evidence_rows,
).length;
summary.records_with_presentation_cases = [...states.values()].filter(
  (x) =>
    x.condition_strings ||
    x.empty_attribute_objects ||
    x.narrative_evidence_rows,
).length;
summary.typed_structured_evidence_rows =
  (summary.evidence_value_types.array || 0) +
  (summary.evidence_value_types.object || 0);
const findings = {
  release_id: summary.release_id,
  conditions,
  empty_objects: emptyObjects,
  valid_undefined_measurements: validUndefined,
  integrity_issues: issues,
  interpretation:
    "Condition strings, narrative evidence arrays and blank empty objects are source-confirmed presentation cases. Technical arrays/objects and raw code/evidence are not inherently errors. All CSV statuses describe this pattern/type audit, not full scientific or browser validation.",
};
fs.mkdirSync(out, { recursive: true });
const save = (name, data) =>
  fs.writeFileSync(path.join(out, name), JSON.stringify(data, null, 2) + "\n");
save("summary.json", summary);
save("findings.json", findings);
save("candidate-hits.json", candidates);
save("urls.json", urls);
const columns = [
  "id",
  "kind",
  "status",
  "condition_strings",
  "empty_attribute_objects",
  "narrative_evidence_rows",
  "structured_evidence_rows",
  "valid_undefined_score",
  "integrity_errors",
];
const csv = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const statuses = {};
const csvRows = [columns.map(csv).join(",")];
for (const s of states.values()) {
  s.status = s.integrity_errors
    ? "integrity-error"
    : s.condition_strings ||
        s.empty_attribute_objects ||
        s.narrative_evidence_rows
      ? "presentation-case"
      : s.valid_undefined_score
        ? "valid-undefined-measurement"
        : "no-targeted-presentation-pattern";
  sum(statuses, s.status);
  csvRows.push(columns.map((k) => csv(s[k])).join(","));
}
fs.writeFileSync(
  path.join(out, "record-status.csv"),
  csvRows.join("\n") + "\n",
);
summary.record_status_counts = statuses;
save("summary.json", summary);
console.log(
  JSON.stringify(
    {
      output: out,
      records: summary.records,
      strings: summary.string_fields,
      evidence_rows: summary.evidence_rows,
      typed_evidence: summary.evidence_value_types,
      record_status_counts: statuses,
      integrity_errors: summary.integrity_errors,
    },
    null,
    2,
  ),
);
if (summary.integrity_errors) process.exitCode = 1;
