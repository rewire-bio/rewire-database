import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateRecords } from "./omics/schema";
import { fileSha256, chunksSha256 } from "./omics/stream-files";
import { parseUseCaseSourceDeclaration, researchFiles } from "./omics/released-contracts";
import { baselineAuditFiles } from "./omics/baseline-coverage";
import { validateUseCaseArtifact } from "../shared/omics/use-cases";
import { createEvidenceIndex, evidenceCsvLines, evidenceJsonlLines } from "../shared/omics/evidence-table";
import { recordPageRoutes } from "../lib/record-pages";
import { recordRouteKinds } from "../lib/omics";

/**
 * Integrity of the pinned current release the frontend serves, checked
 * directly against its files rather than through rendered HTML: records,
 * use cases and their sources, research sidecars, evidence exports, archive
 * checksums, baseline audits and the result/evaluation route inventory.
 */
export function checkReleaseData(root = "public") {
  const failures: string[] = [];
  const read = (file: string) => fs.readFileSync(path.join(root, file));
  const lock = JSON.parse(fs.readFileSync("benchmark-data.lock.json", "utf8"));
  const catalogueBytes = read("omics/catalogue.json");
  const catalogue = JSON.parse(catalogueBytes.toString("utf8"));
  const manifest = JSON.parse(read("omics/manifest.json").toString("utf8"));
  if (catalogue.release_id !== lock.release_id || manifest.release_id !== lock.release_id) failures.push("Hydrated release differs from the data pin");
  const records = validateRecords(catalogue.records);
  const release = path.join("omics/releases", catalogue.release_id);
  const releaseManifest = JSON.parse(read(path.join(release, "manifest.json")).toString("utf8"));
  for (const [file, digest] of Object.entries(releaseManifest.files as Record<string, string>))
    if (!fs.existsSync(path.join(root, release, file)) || fileSha256(path.join(root, release, file)) !== digest) failures.push(`Checksum ${release}/${file}`);
  if (releaseManifest.files["catalogue.json"] && createHash("sha256").update(catalogueBytes).digest("hex") !== releaseManifest.files["catalogue.json"])
    failures.push("Current catalogue differs from its release manifest");
  const declaration = manifest.coverage?.use_cases;
  if (Boolean(declaration) !== Boolean(manifest.files["use-cases.json"])) failures.push("Use-case declaration/export mismatch");
  if (declaration) validateUseCaseArtifact(catalogue, JSON.parse(read(path.join(release, "use-cases.json")).toString("utf8")), declaration);
  for (const source of parseUseCaseSourceDeclaration(manifest.coverage?.use_case_sources || [])) {
    const copies = [path.join(root, release, source.file), path.join(root, "omics/sources", `${source.sha256}.md`)];
    if (copies.some((file) => !fs.existsSync(file) || fileSha256(file) !== source.sha256)) failures.push(`Missing or changed use-case source copy: ${source.file}`);
  }
  for (const [name, expected] of Object.entries(researchFiles(catalogue)))
    if (!fs.existsSync(path.join(root, release, name)) || read(path.join(release, name)).toString("utf8") !== expected)
      failures.push(`Research sidecar differs from catalogue: ${name}`);
  const evidence = createEvidenceIndex(catalogue, { cache: false });
  if (fileSha256(path.join(root, release, "evidence.jsonl")) !== chunksSha256(evidenceJsonlLines(evidence.iterate())) ||
      fileSha256(path.join(root, release, "evidence.csv")) !== chunksSha256(evidenceCsvLines(evidence.iterate())))
    failures.push("Evidence exports do not match their release records");
  // The manifest's generator and exporter hashes identify the producer's source
  // files, which this repository mirrors under its own paths; every data file and
  // every other manifest field must match exactly.
  const comparable = (name: string, text: string) => {
    if (name !== "manifest.json") return text;
    const { generator_sha256: _generator, exporter_sha256: _exporter, ...rest } = JSON.parse(text);
    return JSON.stringify(rest);
  };
  for (const [name, expected] of Object.entries(baselineAuditFiles(catalogueBytes, "published_release").files)) {
    const file = path.join(root, "omics/baseline-coverage", catalogue.release_id, name);
    if (!fs.existsSync(file) || comparable(name, fs.readFileSync(file, "utf8")) !== comparable(name, expected)) failures.push(`Baseline audit export mismatch: ${name}`);
  }
  // Every canonical and alias result/evaluation route has exactly one prepared page.
  const routes = recordPageRoutes(catalogue);
  const expected = records.filter((record) => record.status !== "excluded").flatMap((record) =>
    recordRouteKinds(record as never).filter((kind) => kind === "result" || kind === "evaluation").map((kind) => `${kind}/${record.id}`));
  const materialized = routes.map((route) => `${route.kind}/${route.record.id}`);
  if (new Set(materialized).size !== materialized.length || materialized.sort().join("\n") !== expected.sort().join("\n"))
    failures.push("Prepared page routes differ from canonical and alias record routes");
  if (failures.length) throw new Error(failures.join("\n"));
  return { release_id: catalogue.release_id, records: records.length, page_routes: routes.length };
}

// tsx runs this checkout's scripts as CommonJS; this holds for any checkout path.
if (require.main === module) console.log(JSON.stringify(checkReleaseData()));
