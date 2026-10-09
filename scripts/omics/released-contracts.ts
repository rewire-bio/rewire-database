import { z } from "zod";
import type { CatalogueSnapshot } from "../../shared/omics/catalogue-query";
import { validateResearchData, deriveResearchReadiness } from "../../shared/omics/research";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sourceFileSchema = z.object({
  file: z.string().regex(/^use-case-source-[a-f0-9]{64}\.md$/),
  sha256: hash,
}).strict();
export type UseCaseSourceDeclaration = z.infer<typeof sourceFileSchema>[];

export function parseUseCaseSourceDeclaration(value: unknown): UseCaseSourceDeclaration {
  const declaration = z.array(sourceFileSchema).max(100).parse(value);
  if (new Set(declaration.map((source) => source.file)).size !== declaration.length ||
      declaration.some((source) => source.file !== `use-case-source-${source.sha256}.md`))
    throw Error("Invalid use-case source filename or duplicate digest");
  return declaration;
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
