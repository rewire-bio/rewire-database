import fs from "node:fs";
import path from "node:path";
import type { CatalogueSnapshot } from "../../services/omics/src/catalogue-query";
import { deriveResearchReadiness, validateResearchData, validateResearchManifest, type ResearchData } from "../../services/omics/src/research";
import { validateInvestigationBundle } from "./research-import";

export const researchInputFiles = ["data/research/manifests.json", "data/research/investigations.json"];

/** Read reviewed evidence only; no staging/workbench directory is consulted. */
export function loadResearchInputs(root = "."): ResearchData | undefined {
  const present = researchInputFiles.map(file => fs.existsSync(path.join(root, file)));
  if (!present.some(Boolean)) return undefined;
  if (!present.every(Boolean)) throw new Error("Research inputs require manifests and reviewed investigations files");
  const data = validateResearchData({
    schema_version: "1.0",
    manifests: JSON.parse(fs.readFileSync(path.join(root, researchInputFiles[0]), "utf8")),
    investigations: JSON.parse(fs.readFileSync(path.join(root, researchInputFiles[1]), "utf8")),
  });
  const snapshots = new Map<string, CatalogueSnapshot>();
  for (const manifest of data.manifests) {
    let snapshot = snapshots.get(manifest.catalogue_release_id);
    if (!snapshot) {
      const file = path.join(root, "public/omics/releases", manifest.catalogue_release_id, "catalogue.json");
      snapshot = JSON.parse(fs.readFileSync(file, "utf8")) as CatalogueSnapshot;
      if (snapshot.release_id !== manifest.catalogue_release_id) throw new Error("Research source release pin mismatch");
      snapshots.set(manifest.catalogue_release_id, snapshot);
    }
    validateResearchManifest(manifest, snapshot);
  }
  for (const report of data.investigations) {
    const manifest = data.manifests.find(item => item.id === report.manifest_id)!;
    validateInvestigationBundle(report, manifest, snapshots.get(manifest.catalogue_release_id)!);
  }
  return data;
}

export function researchFiles(snapshot: CatalogueSnapshot): Record<string, string> {
  if (!snapshot.research) return {};
  const data = validateResearchData(snapshot.research, snapshot);
  const envelope = (items: unknown[]) => JSON.stringify({ schema_version: "1.0", release_id: snapshot.release_id, items }, null, 2) + "\n";
  return {
    "research-manifests.json": envelope(data.manifests),
    "research-readiness.json": envelope(deriveResearchReadiness(snapshot)),
    "research-investigations.json": envelope(data.investigations),
  };
}
