import {
  applyAcquisitionCorrections,
  profileCorrectionFile,
  getMfassPrecisionCorrection,
  mfassPrecisionCorrectionFile,
} from "../acquisition/records";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  auditHash,
  auditTarget,
  canonicalAudit,
  validateAudit,
  type AuditCheck,
  type AuditRun,
  type AuditResolution,
} from "../../../services/omics/src/audit";
import { validateRecords, type RecordEntry } from "../schema";
const dir = "data/omics/audits";
const baseline = JSON.parse(
  fs.readFileSync("public/omics/catalogue.json", "utf8"),
);
const read = (p: string): any[] =>
  fs.existsSync(p)
    ? fs
        .readFileSync(p, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const acquired = read(
  "data/omics/acquisition/2026-09-19/reviewed-records.jsonl",
);
const priorRecords: RecordEntry[] = [
  ...new Map(
    [...baseline.records, ...acquired].map(
      (r: RecordEntry) => [r.id, r] as const,
    ),
  ).values(),
];
const records = applyAcquisitionCorrections(priorRecords);
validateRecords(records);
const byId = new Map(records.map((r) => [r.id, r]));
const reviewedBaseline = JSON.parse(
  fs.readFileSync(
    "public/omics/releases/2026-09-19-f5c67a009c10/catalogue.json",
    "utf8",
  ),
);
const receiptRecords = new Map<string, RecordEntry>(
  reviewedBaseline.records.map((r: RecordEntry) => [r.id, r]),
);
const receiptsFiles = [
  "2026-09-19-existing-verification.receipts.jsonl",
  "2026-09-19-metadata-verification.receipts.jsonl",
  "2026-09-19-source-access.receipts.jsonl",
];
const evidenceFiles = [
  ...receiptsFiles.map((f) => `${dir}/${f}`),
  profileCorrectionFile,
  mfassPrecisionCorrectionFile,
  "data/omics/acquisition/2026-09-19/integration-decisions.jsonl",
  "data/omics/acquisition/2026-09-19/integration-receipt.json",
];
const receiptHash = evidenceFiles.map((f) => [
  f,
  fs.existsSync(f) ? auditHash(fs.readFileSync(f, "utf8")) : null,
]);
const revision = auditHash(
  [
    "scripts/omics/audit/generate.ts",
    "scripts/omics/acquisition/records.ts",
    "services/omics/src/audit.ts",
    "scripts/omics/schema.ts",
  ].map((file) => [
    file,
    createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  ]),
);
const inventory = records
  .map((r) => [r.id, auditHash(r)])
  .sort(([a], [b]) => a.localeCompare(b));
const runId = `audit-2026-09-19-${auditHash([baseline.release_id, inventory, receiptHash, revision]).slice(0, 16)}`;
const date = "2026-09-19";
const checks: AuditCheck[] = [];
function add(
  r: RecordEntry,
  category: AuditCheck["category"],
  outcome: AuditCheck["outcome"],
  paths: string[],
  explanation: string,
  receipt: string,
  extra: Partial<AuditCheck> = {},
  sources = byId,
) {
  const fields = [...new Set(paths)].sort();
  if (!fields.length) return;
  const c: AuditCheck = {
    id: "",
    run_id: runId,
    record_id: r.id,
    record_kind: r.kind,
    record_name: r.name,
    field_paths: fields,
    target_sha256: auditTarget(r, fields),
    category,
    outcome,
    checked_at: date,
    source_ids: r.kind === "source" ? [r.id] : r.source_ids,
    evidence_row_ids: [],
    source_locators:
      typeof r.attributes.source_locator === "string"
        ? [r.attributes.source_locator]
        : [],
    source_hashes: r.source_ids
      .map((id) => sources.get(id)?.attributes.artifact_sha256)
      .filter(
        (h): h is string => typeof h === "string" && /^[a-f0-9]{64}$/.test(h),
      ),
    receipt_ids: receipt ? [receipt] : [],
    explanation,
    prior_check_ids: [],
    ...extra,
  };
  c.recorded_value_json = canonicalAudit(
    fields.map((p) => [
      p,
      p === "$record"
        ? "Complete record hash; original version in release download"
        : p.split(".").reduce<any>((v, k) => v?.[k], r),
    ]),
  );
  c.source_fingerprints = Object.fromEntries(
    c.source_ids.map((id) => {
      const source = sources.get(id);
      if (!source || source.kind !== "source")
        throw Error(`Missing audit source ${id}`);
      return [id, auditHash(source)];
    }),
  );
  c.id = `check-${auditHash({ ...c, id: undefined }).slice(0, 32)}`;
  checks.push(c);
  return c;
}
function leaves(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && Object.keys(value).length)
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k),
    );
  return [prefix];
}
const verified = new Map<string, Set<string>>();
for (const file of receiptsFiles.slice(0, 2))
  for (const [index, receipt] of read(`${dir}/${file}`).entries()) {
    const r = receiptRecords.get(receipt.record_id);
    if (!r) continue;
    const rawCategory =
      receipt.check_category || receipt.category || "metadata";
    const category: AuditCheck["category"] = [
      "structure",
      "source_access",
      "source_transcription",
      "scientific_context",
      "metadata",
      "historical_receipt",
    ].includes(rawCategory)
      ? rawCategory
      : "metadata";
    const paths = receipt.field_paths || [];
    if (!paths.length) continue;
    const extra: Partial<AuditCheck> = {
      source_ids:
        receipt.source_ids ||
        (receipt.source_id ? [receipt.source_id] : r.source_ids),
      source_locators:
        receipt.source_locators ||
        (receipt.source_locator ? [receipt.source_locator] : []),
      source_hashes: receipt.artifact_sha256 ? [receipt.artifact_sha256] : [],
      observed_value_json:
        receipt.evidence?.source_cell !== undefined
          ? JSON.stringify(receipt.evidence.source_cell)
          : receipt.observed_value !== undefined
            ? JSON.stringify(receipt.observed_value)
            : null,
    };
    const explanation =
      receipt.explanation ||
      receipt.evidence?.reason ||
      receipt.evidence?.warning ||
      `${receipt.method || receipt.review_method}. Scope: ${receipt.verification_level || category}.`;
    const check = add(
      r,
      category,
      receipt.outcome,
      paths,
      explanation,
      `${file}:line:${index + 1}`,
      extra,
      receiptRecords,
    );
    const current = byId.get(r.id);
    const applies =
      current &&
      check &&
      auditTarget(current, paths) === check.target_sha256 &&
      check.source_ids.every(
        (id) =>
          byId.get(id)?.kind === "source" &&
          check.source_fingerprints?.[id] === auditHash(byId.get(id)),
      );
    if (
      applies &&
      receipt.outcome === "supported" &&
      category !== "historical_receipt"
    )
      for (const p of paths) {
        const set = verified.get(r.id) || new Set<string>();
        set.add(p);
        verified.set(r.id, set);
      }
  }
const resolutions: AuditResolution[] = [];
const valueAt = (r: RecordEntry, path: string) =>
  path.split(".").reduce<any>((v, k) => v?.[k], r);
function registerCorrection(correction: any, file: string) {
  const old = priorRecords.find((r) => r.id === correction.record_id);
  const updated = byId.get(correction.record_id);
  if (!old || !updated)
    throw Error(`Correction target missing ${correction.record_id}`);
  for (const patch of correction.changes) {
    const paths = [patch.field_path];
    if (
      canonicalAudit(valueAt(updated, patch.field_path)) !==
      canonicalAudit(patch.new_value)
    )
      throw Error(`Correction was not applied ${patch.field_path}`);
    const alreadyChanged =
      canonicalAudit(valueAt(old, patch.field_path)) ===
      canonicalAudit(patch.new_value);
    if (
      !alreadyChanged &&
      canonicalAudit(valueAt(old, patch.field_path)) !==
        canonicalAudit(patch.old_value)
    )
      throw Error(`Unexpected prior correction value ${patch.field_path}`);
    const category = patch.category || "metadata";
    const extra = {
      source_ids: patch.source_ids,
      source_hashes: patch.artifact_sha256,
      source_locators: [patch.source_locator],
    };
    // Reuse an original finding only when its exact prior field value matches.
    const previous = checks
      .filter(
        (c) =>
          c.record_id === old.id &&
          c.category === category &&
          canonicalAudit(c.field_paths) === canonicalAudit(paths) &&
          c.outcome !== "supported" &&
          c.target_sha256 === auditTarget(old, paths),
      )
      .map((c) => c.id);
    if (!alreadyChanged) {
      const before = add(
        old,
        category,
        patch.outcome === "contradicted"
          ? "contradicted"
          : "insufficient_evidence",
        paths,
        correction.finding,
        file,
        extra,
      )!;
      previous.push(before.id);
    }
    const after = add(
      updated,
      category,
      "supported",
      paths,
      `Narrow correction verified against the specified primary artifact. ${correction.finding} No new experimental reproduction or verification of other fields is claimed.`,
      file,
      {
        ...extra,
        prior_check_ids: previous,
        observed_value_json: JSON.stringify(patch.new_value),
      },
    )!;
    const set = verified.get(updated.id) || new Set<string>();
    for (const path of leaves(patch.new_value, patch.field_path)) set.add(path);
    verified.set(updated.id, set);
    if (previous.length)
      resolutions.push({
        id: `resolution-${auditHash([previous, after.id]).slice(0, 24)}`,
        check_ids: previous,
        followup_check_ids: [after.id],
        published_release_id: "containing-release",
        resolved_at: date,
        explanation: correction.finding,
      });
  }
}
if (fs.existsSync(profileCorrectionFile))
  registerCorrection(
    JSON.parse(fs.readFileSync(profileCorrectionFile, "utf8")),
    profileCorrectionFile,
  );
const mfassCorrection = getMfassPrecisionCorrection();
if (mfassCorrection)
  registerCorrection(mfassCorrection, mfassCorrection.correction_file);
const sourceAccess = new Map(
  read(`${dir}/${receiptsFiles[2]}`).map((r, i) => [
    r.source_id,
    { ...r, line: i + 1 },
  ]),
);
for (const r of records) {
  add(
    r,
    "structure",
    "supported",
    ["$record"],
    "Record shape, stable identity, public-field boundary and linked target types pass the shared catalogue validator. This does not verify scientific statements.",
    "scripts/omics/schema.ts",
  );
  if (r.kind === "source") {
    const receipt = sourceAccess.get(r.id);
    const frozenSource = receiptRecords.get(r.id);
    const sourceVersion = receipt && frozenSource ? frozenSource : r;
    add(
      sourceVersion,
      "source_access",
      receipt && frozenSource ? receipt.outcome : "insufficient_evidence",
      [
        "attributes.url",
        "attributes.artifact_url",
        "attributes.artifact_sha256",
        "attributes.version",
      ],
      receipt?.reason ||
        "New source bytes are documented in the acquisition batch; separate retrieval audit not yet performed.",
      receipt && frozenSource ? `${receiptsFiles[2]}:line:${receipt.line}` : "",
      {
        source_hashes: receipt?.retrieved_sha256
          ? [receipt.retrieved_sha256]
          : [],
        observed_value_json: receipt?.retrieved_sha256
          ? JSON.stringify(receipt.retrieved_sha256)
          : null,
      },
      receipt && frozenSource ? receiptRecords : byId,
    );
    if (receipt && frozenSource && auditHash(r) !== auditHash(frozenSource))
      add(
        r,
        "source_access",
        "insufficient_evidence",
        ["$record"],
        "Source metadata changed since the retrieval receipt; the prior receipt remains bound to its frozen source version.",
        "source-version-inventory",
      );
  }
  if (r.kind === "result" && r.attributes.acquisition_candidate_id) {
    add(
      r,
      "source_transcription",
      "supported",
      [
        "attributes.numeric_value",
        "attributes.printed_value",
        "attributes.source_locator",
      ],
      "Acquired cell independently matched against the pinned primary CSV, JSON, XML, spreadsheet or PDF representation. Scientific compatibility and missing conditions remain separate.",
      `data/omics/acquisition/2026-09-19/integration-decisions.jsonl#${r.attributes.acquisition_candidate_id}`,
      { observed_value_json: JSON.stringify(r.attributes.printed_value) },
    );
    const set = verified.get(r.id) || new Set<string>();
    [
      "attributes.numeric_value",
      "attributes.printed_value",
      "attributes.source_locator",
    ].forEach((p) => set.add(p));
    verified.set(r.id, set);
  }
  const paths = leaves({
    name: r.name,
    description: r.description,
    facets: r.facets,
    source_ids: r.source_ids,
    attributes: r.attributes,
  }).filter((p) => !verified.get(r.id)?.has(p));
  for (let start = 0; start < paths.length; start += 100)
    add(
      r,
      "metadata",
      "insufficient_evidence",
      paths.slice(start, start + 100),
      "Remaining factual/context fields were inventoried. Existing record status or a general citation does not independently verify each field; additional source-specific adjudication is required. This does not declare the fields false.",
      "field-inventory",
    );
  // Every relationship is explicitly assessed apart from existence/type checking.
  if (r.links.length)
    add(
      r,
      "scientific_context",
      "insufficient_evidence",
      ["links"],
      "Relationship endpoints and types are structurally valid. Scientific identity, shared-family equivalence and evaluation compatibility need a source-specific check; graph membership alone is not verification.",
      "relationship-inventory",
    );
}
// Acquisition blockers are linked to existing benchmark records, not silently discarded.
for (const [i, gap] of read(
  "data/omics/acquisition/2026-09-19/integration-decisions.jsonl",
).entries())
  if (!gap.accepted && gap.reason.startsWith("quarantined")) {
    const r = byId.get(gap.benchmark_id);
    if (r)
      add(
        r,
        "scientific_context",
        gap.reason.includes("conflict")
          ? "contradicted"
          : "insufficient_evidence",
        ["id"],
        `${gap.reason}; candidate ${gap.candidate_id}. This finding concerns the candidate source evidence, not every result in the benchmark.`,
        `data/omics/acquisition/2026-09-19/integration-decisions.jsonl:line:${i + 1}`,
        {
          source_locators: [gap.source_locator],
          source_hashes: [gap.artifact_sha256],
        },
      );
  }
const unique = [...new Map(checks.map((c) => [c.id, c])).values()].sort(
  (a, b) => a.id.localeCompare(b.id),
);
const run: AuditRun = {
  id: runId,
  baseline_release_id: baseline.release_id,
  inventory_sha256: auditHash(inventory),
  started_at: date,
  completed_at: date,
  reviewer:
    "Codex automated checks and separate AI-assisted source reviews; no human sign-off",
  review_method: "ai_assisted",
  verifier_revision: revision,
  scope:
    "Current catalogue plus the hash-pinned acquisition batch. All records and relationships inventoried; checks apply to exact field values and source fingerprints. Historical versions remain preserved and are not blanket reverified.",
  limitations: [
    "Supported structural/access/history checks do not establish scientific validity",
    "Unresolved fields remain insufficient evidence",
    "New source transcription checks are distinct from preserved historical review",
    "No new models or experimental reproductions were run",
    "Distinct archived scientific versions outside this current inventory require subsequent audit runs",
  ],
  record_count: new Set(unique.map((c) => c.record_id)).size,
  check_count: unique.length,
};
validateAudit({
  schema_version: "1.0",
  runs: [run],
  checks: unique,
  resolutions,
});
const outputs: { file: string; bytes: Buffer }[] = [];
function writeImmutable(file: string, bytes: Buffer) {
  outputs.push({ file, bytes });
}
writeImmutable(
  `${dir}/${runId}.run.json`,
  Buffer.from(JSON.stringify(run, null, 2) + "\n"),
);
writeImmutable(
  `${dir}/${runId}.checks.jsonl.gz`,
  gzipSync(unique.map((c) => JSON.stringify(c)).join("\n") + "\n", {
    level: 9,
  }),
);
if (resolutions.length)
  writeImmutable(
    `${dir}/${runId}.resolutions.jsonl`,
    Buffer.from(resolutions.map((r) => JSON.stringify(r)).join("\n") + "\n"),
  );
writeImmutable(
  `${dir}/${runId}.inventory.json`,
  Buffer.from(JSON.stringify(inventory) + "\n"),
);
for (const { file, bytes } of outputs)
  if (fs.existsSync(file) && !fs.readFileSync(file).equals(bytes))
    throw Error(`Audit overwrite rejected ${file}`);
for (const { file, bytes } of outputs)
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
console.log(
  JSON.stringify(
    {
      ...run,
      outcomes: Object.fromEntries(
        [...new Set(unique.map((c) => c.outcome))].map((o) => [
          o,
          unique.filter((c) => c.outcome === o).length,
        ]),
      ),
    },
    null,
    2,
  ),
);
