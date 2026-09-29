import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalResearchJson, researchHash, validateResearchIntegrity } from "../../services/omics/src/research-integrity";
export { canonicalResearchJson, researchHash } from "../../services/omics/src/research-integrity";
import type { CatalogueSnapshot } from "../../services/omics/src/catalogue-query";
import { assertPublicResearch, researchInvestigationSchema, validateResearchManifest, type ResearchInvestigation } from "../../services/omics/src/research";

/** Validate against the exact source snapshot before accepting local work. */
export function validateInvestigationBundle(input: unknown, manifestInput: unknown, snapshot: CatalogueSnapshot): ResearchInvestigation {
  assertPublicResearch(input);
  canonicalResearchJson(input);
  const manifest = validateResearchManifest(manifestInput, snapshot);
  const report = researchInvestigationSchema.parse(input);
  if (snapshot.release_id !== manifest.catalogue_release_id)
    throw new Error("Investigation must pin the exact source catalogue release");
  return validateResearchIntegrity(report, manifest);
}

export function stageResearchBundle(options: { bundle: unknown; manifest: unknown; catalogue: CatalogueSnapshot; artifactPaths: Record<string, string>; root?: string }) {
  const manifest = validateResearchManifest(options.manifest, options.catalogue);
  const report = validateInvestigationBundle(options.bundle, manifest, options.catalogue);
  if (report.review.status !== "pending" || report.review.method !== "ai_assisted" || report.claim_level !== "exploratory")
    throw new Error("Worker import accepts pending exploratory reports only");
  const verifiedArtifacts = manifest.artifacts.map(artifact => {
    const file = options.artifactPaths[artifact.id];
    if (!file || !path.isAbsolute(file) || !fs.statSync(file).isFile()) throw new Error(`Missing local artifact ${artifact.id}`);
    const digest = crypto.createHash("sha256"), descriptor = fs.openSync(file, "r");
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      let count: number;
      while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, count));
    } finally { fs.closeSync(descriptor); }
    const hash = digest.digest("hex");
    if (hash !== artifact.sha256) throw new Error(`Artifact checksum mismatch: ${artifact.id}`);
    return { id: artifact.id, sha256: hash };
  });
  const receipt = {
    schema_version: "1.0", report_id: report.id, catalogue_release_id: report.catalogue_release_id,
    bundle_sha256: researchHash(report), manifest_sha256: researchHash(manifest),
    artifact_checks: verifiedArtifacts, numerical_receipts: report.attempts.filter(attempt => attempt.receipt).map(attempt => ({ id: attempt.id, sha256: attempt.receipt_sha256 })),
    review_status: "pending", limitation: "Artifact bytes and numerical receipt integrity verified. Scientific review and independent numerical reproduction remain separate requirements.",
  };
  const dir = path.join(options.root || process.cwd(), "workbench/research-imports", report.id);
  const files = { "bundle.json": report, "manifest.json": manifest, "import-receipt.json": receipt };
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(dir, name), bytes = JSON.stringify(value, null, 2) + "\n";
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== bytes) throw new Error("Existing research staging entry differs; use a new report ID");
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  return { id: report.id, staged: true, directory: dir, reviewed: false };
}

if (process.argv[1]?.endsWith("research-import.ts")) {
  const [bundleFile, manifestsFile, catalogueFile, resolverFile] = process.argv.slice(2);
  if (!bundleFile || !manifestsFile || !catalogueFile || !resolverFile) throw new Error("Usage: tsx scripts/omics/research-import.ts bundle.json manifests.json catalogue.json private-resolver.json");
  const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
  const bundle = read(bundleFile), input = read(manifestsFile);
  const manifest = Array.isArray(input) ? input.find(item => item.id === bundle.manifest_id) : input;
  console.log(JSON.stringify(stageResearchBundle({ bundle, manifest, catalogue: read(catalogueFile), artifactPaths: read(resolverFile) }), null, 2));
}
