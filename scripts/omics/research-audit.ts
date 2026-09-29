import fs from "node:fs";
import path from "node:path";
import { parseCatalogue } from "../../lib/omics";
import { deriveResearchReadiness, researchCapabilities, validateResearchManifest, type ResearchManifest } from "../../services/omics/src/research";
import type { CatalogueSnapshot } from "../../services/omics/src/catalogue-query";

export function auditResearchReadiness(snapshot: CatalogueSnapshot, manifests?: ResearchManifest[]) {
  manifests?.forEach(manifest => validateResearchManifest(manifest, snapshot));
  const items = deriveResearchReadiness(snapshot, manifests);
  const counts = Object.fromEntries(["dataset", "dataset_subset", "evaluation"].map(kind => {
    const records = items.filter(item => item.kind === kind);
    return [kind, { total: records.length, with_verified_artifact_manifests: records.filter(item => item.manifest_ids.length).length,
      ...Object.fromEntries(researchCapabilities.map(capability => [capability, records.filter(item => item.capabilities[capability].ready).length])) }];
  }));
  return {
    schema_version: "1.0", release_id: snapshot.release_id, assessed_at: new Date().toISOString(), counts,
    interpretation: "Capabilities require their own verified evidence. Dataset source-review status and local availability do not establish scientific readiness. Subset evidence is not whole-dataset coverage.",
    items,
  };
}
if (process.argv[1]?.endsWith("research-audit.ts")) {
  const [catalogueFile = "public/omics/catalogue.json", manifestsFile] = process.argv.slice(2);
  const snapshot = parseCatalogue(JSON.parse(fs.readFileSync(catalogueFile, "utf8")));
  const manifests = manifestsFile ? JSON.parse(fs.readFileSync(manifestsFile, "utf8")) : undefined;
  const audit = auditResearchReadiness(snapshot, manifests);
  if (!/^[a-z0-9-]+$/.test(snapshot.release_id)) throw new Error("Invalid release identity");
  const file = path.join("workbench/research-audits", `${snapshot.release_id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(audit, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ release_id: audit.release_id, counts: audit.counts, file }, null, 2));
}
