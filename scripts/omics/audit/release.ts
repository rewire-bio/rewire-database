import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  auditHash,
  auditIndex,
  validateAudit,
  type AuditBundle,
} from "../../../services/omics/src/audit";
const root = "data/omics/audits";
export function auditInputFiles(): string[] {
  return fs.existsSync(root)
    ? fs
        .readdirSync(root)
        .filter(
          (f) =>
            f.endsWith(".json") ||
            f.endsWith(".jsonl") ||
            f.endsWith(".jsonl.gz"),
        )
        .sort()
        .map((f) => path.join(root, f))
    : [];
}
export function loadAudits(): AuditBundle {
  const bundle: AuditBundle = {
    schema_version: "1.0",
    runs: [],
    checks: [],
    resolutions: [],
  };
  for (const file of auditInputFiles()) {
    const raw = fs.readFileSync(file);
    const text = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString(
      "utf8",
    );
    if (file.endsWith(".run.json")) bundle.runs.push(JSON.parse(text));
    else if (file.includes(".checks."))
      bundle.checks.push(
        ...text
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l)),
      );
    else if (file.endsWith(".resolutions.jsonl"))
      bundle.resolutions.push(
        ...text
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l)),
      );
  }
  return validateAudit(bundle);
}
export function publishedResolutionBindings(
  archiveRoot = "data/omics/releases",
): Map<string, string> {
  const bindings = new Map<string, string>();
  if (!fs.existsSync(archiveRoot)) return bindings;
  for (const entry of fs.readdirSync(archiveRoot, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(entry.name)
    )
      continue;
    const file = path.join(
      archiveRoot,
      entry.name,
      "audit-resolutions.json.gz",
    );
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(
      fs.readFileSync(path.join(archiveRoot, entry.name + ".json"), "utf8"),
    );
    const raw = gunzipSync(fs.readFileSync(file));
    if (
      manifest.files["audit-resolutions.json"] !==
      createHash("sha256").update(raw).digest("hex")
    )
      throw Error("Archived resolution hash mismatch");
    for (const resolution of JSON.parse(raw.toString())) {
      const previous = bindings.get(resolution.id);
      if (previous && previous !== resolution.published_release_id)
        throw Error("Historical resolution publication changed");
      bindings.set(resolution.id, resolution.published_release_id);
    }
  }
  return bindings;
}
export function auditFiles(bundle: AuditBundle, releaseId?: string) {
  bundle = validateAudit(bundle);
  const bindings = releaseId
    ? publishedResolutionBindings()
    : new Map<string, string>();
  if (releaseId)
    bundle = {
      ...bundle,
      resolutions: bundle.resolutions.map((r) => ({
        ...r,
        published_release_id:
          r.published_release_id === "containing-release"
            ? bindings.get(r.id) || releaseId
            : r.published_release_id,
      })),
    };
  const index = auditIndex(bundle.checks);
  const byId = new Map(index.map((r) => [r.record_id, r]));
  const files: Record<string, string> = {};
  const ordered = [...bundle.checks].sort(
    (a, b) =>
      a.record_id.localeCompare(b.record_id) || a.id.localeCompare(b.id),
  );
  let group: typeof ordered = [];
  let size = 2;
  let n = 0;
  const flush = () => {
    if (!group.length) return;
    const id = String(n++).padStart(6, "0");
    files[`audit-checks-${id}.json`] = JSON.stringify(group) + "\n";
    for (const c of group) {
      const r = byId.get(c.record_id)!;
      if (!r.chunk_ids.includes(id)) r.chunk_ids.push(id);
    }
    group = [];
    size = 2;
  };
  for (const c of ordered) {
    const bytes = Buffer.byteLength(JSON.stringify(c)) + 1;
    if (bytes > 550_000) throw Error("Audit check exceeds serving budget");
    if (size + bytes > 550_000) flush();
    group.push(c);
    size += bytes;
  }
  flush();
  files["audit-runs.json"] = JSON.stringify(bundle.runs) + "\n";
  files["audit-resolutions.json"] = JSON.stringify(bundle.resolutions) + "\n";
  files["audit-index.json"] = JSON.stringify(index) + "\n";
  files["audit-checks.jsonl"] =
    bundle.checks.map((c) => JSON.stringify(c)).join("\n") + "\n";
  const cols = [
    "id",
    "run_id",
    "record_id",
    "record_kind",
    "record_name",
    "field_paths",
    "category",
    "outcome",
    "checked_at",
    "target_sha256",
    "recorded_value_json",
    "observed_value_json",
    "source_fingerprints",
    "source_ids",
    "source_locators",
    "source_hashes",
    "receipt_ids",
    "explanation",
    "prior_check_ids",
  ] as const;
  const quote = (v: unknown) => {
    const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
    return (
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"'
    );
  };
  files["audit-checks.csv"] =
    [
      cols.join(","),
      ...bundle.checks.map((c) => cols.map((k) => quote(c[k])).join(",")),
    ].join("\n") + "\n";
  return {
    files,
    coverage: {
      schema_version: "1.0",
      runs: bundle.runs.length,
      records: index.length,
      checks: bundle.checks.length,
      resolutions: bundle.resolutions.length,
      bundle_sha256: auditHash(bundle),
      outcomes: Object.fromEntries(
        [...new Set(bundle.checks.map((c) => c.outcome))].map((o) => [
          o,
          bundle.checks.filter((c) => c.outcome === o).length,
        ]),
      ),
      scope:
        "Append-only checks apply only to their recorded content hashes. Structural checks and historical reviews are not new source verification or experimental reproduction.",
    },
  };
}
