import fs from "node:fs";
import path from "node:path";
import { sha256 } from "./store.mjs";
import { computeRendererEpoch } from "./renderer-epoch.mjs";

/** Field iteration order is visible in detail metadata; never canonicalize object keys. */
export function detailDependencyKey(epoch: string, dependencies: unknown): string {
  return sha256(JSON.stringify({ epoch, dependencies }));
}

/** Capture bytes before any loader memoizes the catalogue or use-case query. */
export function captureDetailInputs(root: string): Record<string, string> {
  const cataloguePath = "public/omics/catalogue.json";
  const bytes = fs.readFileSync(path.join(root, cataloguePath));
  const catalogue = JSON.parse(bytes.toString("utf8"));
  const inputs: Record<string, string> = { [cataloguePath]: sha256(bytes) };
  if (catalogue.coverage?.use_cases) {
    if (typeof catalogue.release_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(catalogue.release_id)) {
      throw new Error("Invalid release id in detail cache input snapshot");
    }
    for (const name of ["manifest.json", "use-cases.json"]) {
      const file = `public/omics/releases/${catalogue.release_id}/${name}`;
      inputs[file] = sha256(fs.readFileSync(path.join(root, file)));
    }
  }
  return inputs;
}

/** Called after each child build, including an asset-incompatibility fallback.
 * A changed input must never associate fresh bytes with an older dependency key.
 */
export function assertDetailInputsUnchanged(root: string, inputs: Record<string, string>, epoch: string): void {
  for (const [file, expected] of Object.entries(inputs)) {
    let actual: string;
    try { actual = sha256(fs.readFileSync(path.join(root, file))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      throw new Error(`Detail cache input disappeared during build: ${file}; rerun before using output`);
    }
    if (actual !== expected) throw new Error(`Detail cache input changed during build: ${file}; rerun before using output`);
  }
  if (computeRendererEpoch(root) !== epoch) throw new Error("Renderer inputs changed during build; rerun before using output");
}
