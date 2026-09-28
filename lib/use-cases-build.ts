import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildCatalogue } from "./catalogue-build";
import { createUseCaseQuery, useCaseHash as hashUseCaseContent, validateUseCaseArtifact, type UseCaseDeclaration } from "../services/omics/src/use-cases";

function loadUseCases(catalogue: ReturnType<typeof buildCatalogue>["catalogue"], catalogueQuery: ReturnType<typeof buildCatalogue>["query"]) {
  if (!catalogue.coverage.use_cases) return {
    query: createUseCaseQuery(catalogue, undefined, undefined, catalogueQuery),
    artifact: undefined,
    entries: [],
  };
  const root = path.join("public/omics/releases", catalogue.release_id);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  if (manifest.release_id !== catalogue.release_id) throw new Error("Use-case manifest belongs to another release");
  const declaration = manifest.coverage?.use_cases as UseCaseDeclaration | undefined;
  const digest = manifest.files?.["use-cases.json"];
  if (Boolean(declaration) !== Boolean(digest)) throw new Error("Use-case declaration and artifact must be published together");
  if (!declaration || hashUseCaseContent(declaration) !== hashUseCaseContent(catalogue.coverage.use_cases)) throw new Error("Use-case manifest and catalogue declaration differ");
  const bytes = digest ? fs.readFileSync(path.join(root, "use-cases.json")) : undefined;
  if (bytes && createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error("Use-case artifact checksum mismatch");
  const artifact = bytes && declaration ? validateUseCaseArtifact(catalogue, JSON.parse(bytes.toString("utf8")), declaration) : undefined;
  const query = createUseCaseQuery(catalogue, artifact, declaration, catalogueQuery);
  return { query, artifact, entries: artifact?.use_cases || [] };
}

let cached: { catalogue: ReturnType<typeof buildCatalogue>["catalogue"]; value: ReturnType<typeof loadUseCases> } | undefined;

/** One validation and reverse index per immutable release, reused by all record pages. */
export function buildUseCases() {
  const { catalogue, query } = buildCatalogue();
  if (!cached || cached.catalogue !== catalogue) cached = { catalogue, value: loadUseCases(catalogue, query) };
  return cached.value;
}
