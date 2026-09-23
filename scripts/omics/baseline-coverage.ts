import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { buildBaselineAudit } from "../../lib/baseline-coverage";
import { parseCatalogue } from "../../lib/omics";

const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function auditCsv(rows: object[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    const text =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    // Keep untrusted record text from becoming a spreadsheet formula.
    return (
      '"' +
      (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') +
      '"'
    );
  };
  return (
    [
      keys.join(","),
      ...rows.map((row) =>
        keys
          .map((key) => cell((row as Record<string, unknown>)[key]))
          .join(","),
      ),
    ].join("\n") + "\n"
  );
}
export function baselineAuditFiles(
  bytes: Buffer,
  publicationStatus: "published_release" | "prospective_review",
) {
  const catalogue = parseCatalogue(JSON.parse(bytes.toString("utf8")));
  const audit = buildBaselineAudit(catalogue);
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  const sourceIds = new Set([
    ...audit.protocols.flatMap((p) => [
      ...p.source_ids,
      ...p.context_source_ids,
    ]),
    ...audit.models.flatMap((m) => m.source_ids),
  ]);
  const sources = catalogue.records
    .filter((r) => r.kind === "source" && sourceIds.has(r.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      review_status: r.status,
      url: r.attributes.url ?? null,
      version: r.attributes.version ?? null,
      retrieved_at: r.attributes.retrieved_at ?? null,
      artifact_sha256: r.attributes.artifact_sha256 ?? null,
    }));
  const files: Record<string, string> = {
    "coverage.json": json(audit),
    "protocol-baselines.csv": auditCsv(audit.protocols),
    "model-evaluation-matrix.csv": auditCsv(audit.models),
    "suite-coverage.csv": auditCsv(audit.suites),
    "sources.json": json(sources),
    "sources.csv": auditCsv(sources),
  };
  const manifest = {
    schema_version: "1.0",
    audit_version: 2,
    release_id: catalogue.release_id,
    release_date: catalogue.released_at,
    publication_status: publicationStatus,
    catalogue_sha256: sha(bytes),
    counts: audit.counts,
    generator_sha256: sha(fs.readFileSync("lib/baseline-coverage.ts")),
    exporter_sha256: sha(fs.readFileSync("scripts/omics/baseline-coverage.ts")),
    review_method:
      "Automated exact-record linkage and editorial triage; no new source review or execution",
    files: Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, sha(text)]),
    ),
  };
  files["manifest.json"] = json(manifest);
  return { audit, files, manifest };
}
export function writeBaselineAudit(
  source = "public/omics/catalogue.json",
  output = "public/omics/baseline-coverage",
  publicationStatus:
    | "published_release"
    | "prospective_review" = "published_release",
  expectedHash?: string,
) {
  const raw = fs.readFileSync(source);
  const bytes = source.endsWith(".gz") ? gunzipSync(raw) : raw;
  if (expectedHash && sha(bytes) !== expectedHash)
    throw new Error("Catalogue checksum mismatch");
  const { audit, files, manifest } = baselineAuditFiles(
    bytes,
    publicationStatus,
  );
  if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(audit.release_id))
    throw new Error("Invalid release ID");
  const directory = path.join(output, audit.release_id);
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(directory, name);
    if (fs.existsSync(target) && fs.readFileSync(target, "utf8") !== text)
      throw new Error(
        `Audit conflict: ${target}; change the audit version/output location instead of overwriting history`,
      );
  }
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(directory, name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, text, { flag: "wx" });
  }
  return manifest;
}
if (process.argv[1]?.endsWith("baseline-coverage.ts")) {
  const args = process.argv.slice(2);
  const allowed = new Set([
    "--source",
    "--output",
    "--publication-status",
    "--sha256",
  ]);
  if (
    args.length % 2 ||
    args.some((arg, i) => i % 2 === 0 && !allowed.has(arg))
  )
    throw new Error(
      "Use --source FILE --output DIR --publication-status published_release|prospective_review --sha256 EXPECTED",
    );
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const status = option("--publication-status") || "published_release";
  if (!["published_release", "prospective_review"].includes(status))
    throw new Error("Invalid publication status");
  console.log(
    JSON.stringify(
      writeBaselineAudit(
        option("--source"),
        option("--output"),
        status as "published_release" | "prospective_review",
        option("--sha256"),
      ),
      null,
      2,
    ),
  );
}
