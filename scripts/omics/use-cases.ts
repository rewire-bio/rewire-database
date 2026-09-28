import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { recordSchema, type RecordEntry } from "./schema";
import {
  parseUseCaseInputs,
  useCaseHash,
  validateUseCaseArtifact,
  type UseCaseInputs,
  type UseCaseArtifact,
} from "../../services/omics/src/use-cases";
import { validateSnapshot } from "../../services/omics/src/validation";

export const useCaseRoot = "data/omics/use-cases";
const reviewedFiles = [
  "inputs.json",
  "sources.json",
  "sources/mfass-matched-study-intake.md",
  "sources/amfr-pilot-readme.md",
] as const;
const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reviewSchema = z.object({
  schema_version: z.literal("1.0"),
  review_method: z.literal("automated_source_review"),
  reviewer: z.string().min(1),
  reviewed_at: z.string().datetime(),
  baseline_release_id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/),
  files: z.record(z.string(), hash),
  source_artifacts: z.record(z.string(), z.enum(reviewedFiles)),
  scope: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
}).strict();

export type ReviewedUseCases = {
  inputs: UseCaseInputs;
  sources: RecordEntry[];
  review: z.infer<typeof reviewSchema>;
  sourceFiles: Record<string, string>;
};

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

/** Content-addressed source bytes are also kept in each immutable release. */
export function useCaseSourceDeclaration(files: Record<string, string>): UseCaseSourceDeclaration {
  return parseUseCaseSourceDeclaration(Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, bytes]) => ({ file, sha256: sha(bytes) })));
}

export function writeUseCaseSourceCopies(
  files: Record<string, string>,
  output = "public/omics/sources",
): void {
  const declaration = useCaseSourceDeclaration(files);
  if (!declaration.length) return;
  // Check every destination first: never replace a historical copy or leave a
  // partial new set because a later source digest has a conflicting alias.
  for (const source of declaration) {
    const target = path.join(output, `${source.sha256}.md`);
    if (fs.existsSync(target) && fs.readFileSync(target, "utf8") !== files[source.file])
      throw Error(`Immutable use-case source conflict: ${target}`);
  }
  fs.mkdirSync(output, { recursive: true });
  for (const source of declaration)
    fs.writeFileSync(path.join(output, `${source.sha256}.md`), files[source.file]);
}

export function useCaseInputFiles(directory = useCaseRoot): string[] {
  return fs.existsSync(directory)
    ? [...reviewedFiles, "review.json"].map((file) => path.join(directory, file))
    : [];
}

/** Read frozen curation only. Builds never refresh evidence fingerprints or receipts. */
export function loadUseCases(directory = useCaseRoot): ReviewedUseCases | undefined {
  if (!fs.existsSync(directory)) return undefined;
  const review = reviewSchema.parse(
    JSON.parse(fs.readFileSync(path.join(directory, "review.json"), "utf8")),
  );
  if (JSON.stringify(Object.keys(review.files).sort()) !==
      JSON.stringify([...reviewedFiles].sort()))
    throw Error("Use-case review must bind every curated input and source artifact");
  const texts = Object.fromEntries(reviewedFiles.map((file) => {
    const bytes = fs.readFileSync(path.join(directory, file));
    if (sha(bytes) !== review.files[file])
      throw Error(`Use-case input changed since review: ${file}`);
    return [file, bytes.toString("utf8")];
  }));
  const inputs = parseUseCaseInputs(JSON.parse(texts["inputs.json"]));
  const sources = z.array(recordSchema).parse(JSON.parse(texts["sources.json"]));
  if (new Set(sources.map((record) => record.id)).size !== sources.length ||
      JSON.stringify(Object.keys(review.source_artifacts).sort()) !==
      JSON.stringify(sources.map((record) => record.id).sort()))
    throw Error("Use-case source inventory does not match the review");
  for (const source of sources) {
    const artifact = review.source_artifacts[source.id];
    if (source.kind !== "source" || source.status !== "source_checked" ||
        !artifact.startsWith("sources/") ||
        source.attributes.artifact_sha256 !== review.files[artifact] ||
        source.attributes.review_artifact !== `${useCaseRoot}/${artifact}` ||
        typeof source.attributes.retrieved_at !== "string" ||
        !Number.isFinite(Date.parse(source.attributes.retrieved_at)) ||
        Date.parse(source.attributes.retrieved_at) > Date.parse(review.reviewed_at))
      throw Error(`Use-case source is not bound to reviewed bytes: ${source.id}`);
    const publicUrl = `https://benchmarks.rewire.it/omics/sources/${review.files[artifact]}.md`;
    if (source.attributes.url !== publicUrl || source.attributes.artifact_url !== publicUrl)
      throw Error(`Use-case source must expose its public content-addressed copy: ${source.id}`);
  }
  const sourceFiles = Object.fromEntries(Object.values(review.source_artifacts)
    .map((file) => [`use-case-source-${review.files[file]}.md`, texts[file]]));
  return { inputs, sources, review, sourceFiles };
}

/** Add source provenance without changing any existing scientific record. */
export function addUseCaseSources(
  records: RecordEntry[],
  reviewed = loadUseCases(),
): RecordEntry[] {
  if (!reviewed) return records;
  const ids = new Set(records.map((record) => record.id));
  for (const source of reviewed.sources)
    if (ids.has(source.id))
      throw Error(`Use-case curation cannot replace existing record: ${source.id}`);
  return [...records, ...reviewed.sources];
}

/** A tombstone must recover real, immutable scoped evidence, not an invented
 * release or a chain of empty tombstones. No archive bytes are rewritten. */
export function validateUseCaseHistory(
  value: UseCaseInputs,
  archiveRoot = "data/omics/releases",
): void {
  const inputs = parseUseCaseInputs(value);
  const history = new Map<string, UseCaseArtifact>();
  for (const mapping of inputs.mappings) {
    if (!["withdrawn", "superseded"].includes(mapping.lifecycle)) continue;
    const releaseId = mapping.prior_release_id!;
    let artifact = history.get(releaseId);
    if (!artifact) {
      const receiptFile = path.join(archiveRoot, `${releaseId}.json`);
      if (!fs.existsSync(receiptFile))
        throw Error(`Historical use-case release does not exist: ${releaseId}`);
      const receipt = fs.readFileSync(receiptFile, "utf8");
      const manifest = JSON.parse(receipt);
      if (manifest.release_id !== releaseId || !manifest.coverage?.use_cases)
        throw Error(`Historical release has no bound use-case declaration: ${releaseId}`);
      const directory = path.join(archiveRoot, releaseId);
      let bundle: Record<string, string> | undefined;
      if (!fs.existsSync(directory)) {
        const file = path.join(archiveRoot, `${releaseId}.bundle.json.gz`);
        if (!fs.existsSync(file))
          throw Error(`Historical use-case artifacts are missing: ${releaseId}`);
        bundle = JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"));
        if (bundle?.["manifest.json"] !== receipt)
          throw Error(`Historical use-case manifest differs from receipt: ${releaseId}`);
      }
      const read = (name: "catalogue.json" | "use-cases.json") => {
        const file = path.join(directory, `${name}.gz`);
        if (!bundle && !fs.existsSync(file))
          throw Error(`Historical use-case artifacts are missing: ${releaseId}/${name}`);
        const bytes = bundle ? bundle[name] : gunzipSync(fs.readFileSync(file)).toString("utf8");
        if (typeof bytes !== "string" || !hash.safeParse(manifest.files?.[name]).success ||
            sha(bytes) !== manifest.files[name])
          throw Error(`Historical use-case checksum mismatch: ${releaseId}/${name}`);
        return JSON.parse(bytes);
      };
      const snapshot = read("catalogue.json");
      if (snapshot.release_id !== releaseId ||
          snapshot.schema_version !== manifest.schema_version ||
          snapshot.released_at !== manifest.released_at ||
          manifest.catalogue_sha256 !== manifest.files["catalogue.json"] ||
          useCaseHash(snapshot.coverage) !== useCaseHash(manifest.coverage))
        throw Error(`Historical use-case catalogue/manifest binding mismatch: ${releaseId}`);
      validateSnapshot(snapshot);
      artifact = validateUseCaseArtifact(snapshot, read("use-cases.json"), manifest.coverage.use_cases);
      history.set(releaseId, artifact);
    }
    const previous = artifact.mappings.find((entry) => entry.id === mapping.id);
    if (!previous || previous.use_case_id !== mapping.use_case_id ||
        previous.revision > mapping.revision ||
        ["withdrawn", "superseded"].includes(previous.lifecycle) ||
        !previous.protocol_id || !previous.endpoint || !previous.citations.length)
      throw Error(`Tombstone has no matching historical scoped evidence: ${mapping.id}`);
  }
}
