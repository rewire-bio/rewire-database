import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { enrichProfiles } from "../../lib/omics-profile";
import { enrichAssociations } from "./enrich";
import {
  validateRecords,
  publicRecords,
  kinds,
  type RecordEntry,
} from "./schema";
const sha = (s: string | Buffer) =>
  crypto.createHash("sha256").update(s).digest("hex");
export function buildRelease(
  records: RecordEntry[],
  releasedAt: string,
  extraCoverage: Record<string, unknown> = {},
) {
  validateRecords(records);
  const ordered = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const all = ordered.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const visible = publicRecords(ordered);
  validateRecords(visible);
  const releaseId =
    releasedAt.slice(0, 10) +
    "-" +
    sha(all + releasedAt + JSON.stringify(extraCoverage)).slice(0, 12);
  const counts = Object.fromEntries(
    kinds.map((k) => [k, visible.filter((r) => r.kind === k).length]),
  );
  const coverage = {
    ...extraCoverage,
    total_records: ordered.length,
    public_records: visible.length,
    counts,
    quarantined_results: ordered.filter(
      (r) =>
        r.kind === "result" && ["needs_review", "disputed"].includes(r.status),
    ).length,
    scope_excluded_records: ordered.filter((r) => r.status === "excluded")
      .length,
    source_checked_results: visible.filter(
      (r) => r.kind === "result" && r.status === "source_checked",
    ).length,
    rewire_result_rows: visible.filter(
      (r) => r.kind === "result" && r.status === "reproduced",
    ).length,
    scope:
      "Specialist omics and molecular models; no clinical assistants or standalone medical imaging.",
    limitation:
      "A dated discovery and source-transcription review, not an exhaustive census or independent reproduction of external experiments.",
  };
  const snapshot = {
    schema_version: "1.0",
    release_id: releaseId,
    released_at: releasedAt,
    records: visible,
    coverage,
  };
  const quote = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const csv =
    [
      "id,kind,name,status,description,facets,source_ids,links,attributes",
      ...visible.map((r) =>
        [
          r.id,
          r.kind,
          r.name,
          r.status,
          r.description,
          JSON.stringify(r.facets),
          JSON.stringify(r.source_ids),
          JSON.stringify(r.links),
          JSON.stringify(r.attributes),
        ]
          .map(quote)
          .join(","),
      ),
    ].join("\n") + "\n";
  const files: Record<string, string> = {
    "catalogue.json": JSON.stringify(snapshot, null, 2) + "\n",
    "records.jsonl": visible.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "records.csv": csv,
  };
  const manifest = {
    schema_version: "1.0",
    release_id: releaseId,
    released_at: releasedAt,
    counts,
    coverage,
    archive_sha256: sha(all),
    catalogue_sha256: sha(files["catalogue.json"]),
    files: Object.fromEntries(
      Object.entries(files).map(([name, data]) => [name, sha(data)]),
    ),
    changelog: Array.isArray(extraCoverage.changelog)
      ? extraCoverage.changelog
      : [
          "Initial omics-only linked catalogue; original literature identifiers and scores retained.",
          "Only checked external numerical claims enter the catalogue; ambiguous values remain in the review queue.",
          "Existing MFASS v2 runs remain separate from external literature.",
        ],
    compatibility: {
      papers: "/benchmark-literature/papers.json",
      results: "/benchmark-literature/results.csv",
      note: "Historical compatibility files retain the original collection, including out-of-scope and unreviewed records. Use this release for current scoped data.",
    },
  };
  return { snapshot, manifest, files };
}
/** Reconstruct archived bytes from preserved inputs and reject any historical drift. */
function restoreArchivedRelease(records: RecordEntry[]) {
  const manifest = JSON.parse(
    fs.readFileSync("data/omics/releases/2026-09-16-b5213be10a49.json", "utf8"),
  );
  const {
    research_lanes,
    search_entries,
    legacy_papers,
    legacy_result_rows,
    source_inputs,
  } = manifest.coverage;
  const old = buildRelease(records, manifest.released_at, {
    research_lanes,
    search_entries,
    legacy_papers,
    legacy_result_rows,
    source_inputs,
  });
  if (JSON.stringify(old.manifest) !== JSON.stringify(manifest))
    throw new Error(
      "Historical release reconstruction differs from its immutable receipt",
    );
  writeArchive(old);
}
function writeArchive(output: ReturnType<typeof buildRelease>) {
  const dir = path.join("public/omics/releases", output.snapshot.release_id);
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    ...output.files,
    "manifest.json": JSON.stringify(output.manifest, null, 2) + "\n",
  };
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(dir, name);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== data)
      throw new Error("Attempt to overwrite immutable release " + file);
    fs.writeFileSync(file, data);
  }
}
function main() {
  const inputs = ["data/omics/migrated.jsonl", "data/omics/discovery.jsonl"];
  const baseRecords = inputs.flatMap((file) =>
    fs.existsSync(file)
      ? fs
          .readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l))
      : [],
  );
  if (!baseRecords.length) throw new Error("No reviewed catalogue inputs");
  restoreArchivedRelease(baseRecords);
  const ledger = fs.existsSync("data/omics/search-ledger.jsonl")
    ? fs
        .readFileSync("data/omics/search-ledger.jsonl", "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  const audit = JSON.parse(
    fs.readFileSync("data/omics/release-config.json", "utf8"),
  );
  const profileInputs = [
    "data/omics/model-profiles.jsonl",
    "data/omics/benchmark-profiles.jsonl",
  ];
  const associationInputs = [
    "data/omics/model-profile-associations.jsonl",
    "data/omics/benchmark-profile-associations.jsonl",
  ];
  const associated = enrichAssociations(
    baseRecords,
    associationInputs.flatMap((file) =>
      fs.existsSync(file)
        ? fs
            .readFileSync(file, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [],
    ),
  );
  const records = enrichProfiles(
    associated,
    profileInputs.flatMap((file) =>
      fs.existsSync(file)
        ? fs
            .readFileSync(file, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [],
    ),
  );
  const profiles = records
    .filter((record) => record.attributes.profile)
    .map((record) => record.attributes.profile as { coverage: string });
  const output = buildRelease(records, audit.released_at, {
    ...(profiles.length
      ? {
          profile_coverage: {
            total: profiles.length,
            reviewed: profiles.filter(
              (profile) => profile.coverage === "reviewed",
            ).length,
            limited: profiles.filter(
              (profile) => profile.coverage === "limited",
            ).length,
          },
          changelog: [
            "Add sourced explanatory model and benchmark profiles and API query support; existing result values and IDs remain unchanged.",
            "Profile review status is independent of numerical-result review; unresolved scientific metadata remains explicit.",
          ],
        }
      : {}),
    research_lanes: 9,
    search_entries: ledger.length,
    legacy_papers: 100,
    legacy_result_rows: 149,
    source_inputs: [
      ...inputs,
      ...profileInputs.filter((file) => fs.existsSync(file)),
      ...associationInputs.filter((file) => fs.existsSync(file)),
    ].map((file) => ({
      file,
      sha256: fs.existsSync(file) ? sha(fs.readFileSync(file)) : null,
    })),
  });
  writeArchive(output);
  fs.writeFileSync(
    "public/omics/catalogue.json",
    output.files["catalogue.json"],
  );
  fs.writeFileSync(
    "public/omics/manifest.json",
    JSON.stringify(output.manifest, null, 2) + "\n",
  );
  console.log(
    `Omics ${output.snapshot.release_id}: ${output.snapshot.records.length} public records; ${output.manifest.coverage.source_checked_results} checked external result rows; ${output.manifest.coverage.quarantined_results} in review.`,
  );
}
if (process.argv[1]?.endsWith("release.ts")) main();
