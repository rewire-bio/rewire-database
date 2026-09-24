import fs from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { gunzipSync } from "node:zlib";
import type { RecordEntry } from "./schema";
import { isModelSubject } from "../../services/omics/src/entity-kinds";

export const modelLinkRoot = "data/omics/reviewed/model-evaluation-links-2026-09-23";
export const modelLinkInputs = fs.existsSync(modelLinkRoot) ? fs.readdirSync(modelLinkRoot).filter(file => /\.(json|jsonl|gz)$/.test(file)).sort().map(file => `${modelLinkRoot}/${file}`) : [];
const edgeSchema = z.object({
  subject_id: z.string(), relation: z.enum(["family", "variant_of", "alias_of", "uses_model"]),
  target_id: z.string(), source_ids: z.array(z.string()).min(1), source_locator: z.string().min(1),
  explanation: z.string().min(1),
});
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Explicit, source-reviewed identities only. Never match names at release time. */
export function applyModelEvaluationLinks(input: RecordEntry[], edges: unknown[], reviewDate = "2026-09-23"): RecordEntry[] {
  const byId = new Map(input.map(record => [record.id, record]));
  const patches = new Map<string, RecordEntry>();
  const claims: RecordEntry[] = [];
  const seen = new Set<string>();
  for (const edge of edges.map(value => edgeSchema.parse(value))) {
    const subject = patches.get(edge.subject_id) || byId.get(edge.subject_id);
    const target = byId.get(edge.target_id);
    if (!subject || !target || subject.id === target.id || !isModelSubject(subject.kind) || target.kind !== "model")
      throw Error("Invalid reviewed model identity endpoint");
    if (edge.relation === "alias_of" && subject.kind !== "model") throw Error("Alias must join model identities of the same kind");
    if (["family", "variant_of"].includes(edge.relation) && ["pipeline", "service"].includes(subject.kind))
      throw Error("A pipeline or hosted service uses a model; it is not the model family");
    for (const source of edge.source_ids) if (byId.get(source)?.kind !== "source") throw Error(`Missing identity source ${source}`);
    const field = `links:${edge.relation}:${edge.target_id}`;
    const key = `${subject.id}|${field}`;
    if (seen.has(key)) throw Error("Duplicate reviewed model identity");
    seen.add(key);
    const claimId = `model-evaluation-identity-${sha(key).slice(0, 20)}`;
    if (byId.has(claimId)) throw Error("Cannot replace reviewed identity claim");
    patches.set(subject.id, { ...subject, links: subject.links.some(link => link.relation === edge.relation && link.target_id === edge.target_id)
      ? subject.links : [...subject.links, { relation: edge.relation, target_id: edge.target_id }] });
    claims.push({ id: claimId, kind: "claim", name: `${subject.name}: ${edge.relation.replaceAll("_", " ")} ${target.name}`, description: edge.explanation,
      status: "source_checked", facets: subject.facets, source_ids: edge.source_ids, links: [{ relation: "subject", target_id: subject.id }],
      attributes: { field, target_id: target.id, source_locator: edge.source_locator,
        review: { method: "automated_source_review", date: reviewDate, note: "Source review establishes this relationship only. Exact evaluated configurations and original numerical review status remain unchanged. " + edge.explanation } } });
  }
  // Cyclic aliases would hide every member from browsing. Reject before release.
  const result = input.map(record => patches.get(record.id) || record);
  const aliases = new Map(result.filter(record => record.kind === "model").map(record => [record.id, record.links.filter(link => link.relation === "alias_of").map(link => link.target_id)]));
  function visit(id: string, path: Set<string>) {
    if (path.has(id)) throw Error("Cyclic model alias");
    for (const target of aliases.get(id) || []) visit(target, new Set([...path, id]));
  }
  for (const id of aliases.keys()) visit(id, new Set());
  return [...result, ...claims];
}

export function addModelEvaluationLinks(input: RecordEntry[]): RecordEntry[] {
  const [linksFile, reviewFile, sourcesFile] = ["links.json", "review.json", "sources.jsonl"].map(file => `${modelLinkRoot}/${file}`);
  const text = fs.readFileSync(linksFile, "utf8"), sourcesText = fs.readFileSync(sourcesFile, "utf8");
  const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"));
  if (review.status !== "reviewed" || review.review_method !== "automated" || review.errors?.length !== 0 || review.links_sha256 !== sha(text) || review.sources_sha256 !== sha(sourcesText)) throw Error("Model identity review receipt mismatch");
  const reviewedFiles = modelLinkInputs.filter(file => !file.endsWith("/review.json")).map(file => file.slice(modelLinkRoot.length + 1));
  if (reviewedFiles.some(file => !review.inputs?.[file])) throw Error("Unreviewed identity input");
  for (const [file, hash] of Object.entries(review.inputs as Record<string, string>))
    if (sha(fs.readFileSync(`${modelLinkRoot}/${file}`)) !== hash) throw Error("Reviewed identity input changed");
  for (const [file, hash] of Object.entries(review.source_artifacts as Record<string, string>))
    if (sha(gunzipSync(fs.readFileSync(`${modelLinkRoot}/${file}`))) !== hash) throw Error("Identity primary artifact mismatch");
  const sources: RecordEntry[] = sourcesText.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const ids = new Set(input.map(record => record.id));
  if (sources.some(record => record.kind !== "source" || ids.has(record.id)) || new Set(sources.map(record => record.id)).size !== sources.length) throw Error("Identity sources must be additive");
  return applyModelEvaluationLinks([...input, ...sources], JSON.parse(text));
}
