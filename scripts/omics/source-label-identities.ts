import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { profileSchema, validateProfileSources } from "../../lib/omics-profile";
import {
  citationOnlyName,
  labelForms,
  matchesLabelForm,
  type LinkedIdentity,
  type SubjectIdentity,
} from "../../services/omics/src/source-identity";
import { applyModelEvaluationLinks } from "./model-evaluation-links";
import { recordSchema, type RecordEntry } from "./schema";

export const sourceLabelRoot = "data/omics/reviewed/source-label-identities-2026-09-24";
const reviewDate = "2026-09-24";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const text = z.string().trim().min(1);
// Kept local: the service package resolves its own zod major version.
const detailSchema = z
  .object({ label: text, value: text, source_ids: z.array(text).min(1), source_locator: text })
  .strict();
const unknownSchema = z.object({ label: text, note: text }).strict();
const entrySchema = z
  .object({
    subject_id: text,
    previous_record_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    source_label: text,
    label_form: z.enum(labelForms),
    status: z.enum(["resolved", "unresolved"]),
    display_name: text,
    identity: text.nullable(),
    configuration: text.nullable(),
    description: text.nullable(),
    source_ids: z.array(text).min(1),
    source_locator: text,
    basis: text,
    known_details: z.array(detailSchema),
    unknown: z.array(unknownSchema).min(1),
    link: z
      .object({
        relation: z.literal("family"),
        target_id: text,
        source_ids: z.array(text).min(1),
        source_locator: text,
        explanation: text,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type SourceLabelEntry = z.infer<typeof entrySchema>;

/** Replace one whole-label occurrence. A surname such as "Ciga" must not match
 * inside a longer word. */
function replaceOnce(value: string, label: string, replacement: string, id: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu");
  const matches = [...value.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Source label must appear exactly once in ${id}`);
  const at = matches[0].index!;
  return value.slice(0, at) + replacement + value.slice(at + label.length);
}

/** Rename tested configurations printed only as a citation or author surname,
 * and the evaluations and results that repeat the label, from explicit reviewed
 * entries. Nothing is renamed by pattern alone. IDs, links, values,
 * locators and comparison conditions are left untouched. */
export function applySourceLabelIdentities(
  input: RecordEntry[],
  entries: unknown[],
  models: unknown[] = [],
  sources: unknown[] = [],
): RecordEntry[] {
  const byId = new Map(input.map((record) => [record.id, record]));
  const added = [...sources, ...models].map((value) => {
    const record = recordSchema.parse(value);
    if (byId.has(record.id)) throw new Error(`Identity input must be additive: ${record.id}`);
    if (record.kind === "source") {
      if (!/^[a-f0-9]{64}$/.test(String(record.attributes.artifact_sha256)))
        throw new Error(`Unpinned identity source ${record.id}`);
    } else if (record.kind !== "model" || record.attributes.entity_level !== "method")
      throw new Error(`Identity profiles must be method-level models: ${record.id}`);
    byId.set(record.id, record);
    return record;
  });
  for (const record of added) {
    for (const id of record.source_ids)
      if (byId.get(id)?.kind !== "source") throw new Error(`Missing source ${id} for ${record.id}`);
    if (record.attributes.profile !== undefined)
      validateProfileSources(profileSchema.parse(record.attributes.profile), byId);
  }
  const changes = new Map<string, RecordEntry>();
  const edges: unknown[] = [];
  for (const raw of entries) {
    const entry = entrySchema.parse(raw);
    const subject = byId.get(entry.subject_id);
    if (!subject || subject.kind !== "configuration")
      throw new Error(`Invalid source-label subject ${entry.subject_id}`);
    if (changes.has(subject.id)) throw new Error(`Duplicate source-label identity ${subject.id}`);
    if (sha(JSON.stringify(subject)) !== entry.previous_record_sha256)
      throw new Error(`Source-label precondition changed: ${subject.id}`);
    if (subject.name !== entry.source_label || !matchesLabelForm(entry.source_label, entry.label_form))
      throw new Error(`Only citation-only names are renamed here: ${subject.id}`);
    if (citationOnlyName.test(entry.display_name) || entry.display_name === entry.source_label)
      throw new Error(`Display name is still citation-only: ${subject.id}`);
    if (entry.status === "unresolved") {
      if (entry.identity || entry.configuration || entry.link || entry.display_name !== `Unresolved method, cited as ${entry.source_label}`)
        throw new Error(`Unresolved identities keep the source label and name no method: ${subject.id}`);
    } else if (!entry.identity) throw new Error(`Resolved identity needs a method: ${subject.id}`);
    for (const id of [...entry.source_ids, ...entry.known_details.flatMap((item) => item.source_ids)])
      if (byId.get(id)?.kind !== "source") throw new Error(`Missing identity source ${id}`);
    const identity: SubjectIdentity = {
      status: entry.status,
      label_form: entry.label_form,
      display_name: entry.display_name,
      identity: entry.identity,
      configuration: entry.configuration,
      basis: entry.basis,
      source_ids: entry.source_ids,
      source_locator: entry.source_locator,
      known_details: entry.known_details,
      unknown: entry.unknown,
      original_name: subject.name,
      original_description: subject.description,
      review: {
        method: "automated_source_review",
        date: reviewDate,
        note: "AI-assisted review against the cited primary sources. No human scientific review. Values, locators and comparison conditions are unchanged.",
      },
    };
    changes.set(subject.id, {
      ...subject,
      name: entry.display_name,
      description: entry.description ?? subject.description,
      source_ids: [...new Set([...subject.source_ids, ...entry.source_ids])],
      attributes: { ...subject.attributes, source_label: entry.source_label, source_identity: identity },
    });
    const reference = entry.status === "resolved"
      ? `${entry.display_name}, cited as ${entry.source_label},`
      : `an unresolved method cited as ${entry.source_label}`;
    const linked = (record: RecordEntry, description: string): RecordEntry => {
      const value: LinkedIdentity = {
        status: entry.status,
        display_name: replaceOnce(record.name, entry.source_label, entry.display_name, record.id),
        subject_id: subject.id,
        original_name: record.name,
        original_description: record.description,
      };
      return { ...record, name: value.display_name, description,
        attributes: { ...record.attributes, source_label: entry.source_label, source_identity: value } };
    };
    const evaluations = input.filter((record) => record.kind === "evaluation" &&
      record.links.some((link) => link.relation === "model" && link.target_id === subject.id));
    if (!evaluations.length) throw new Error(`No evaluations for ${subject.id}`);
    for (const evaluation of evaluations) {
      if (changes.has(evaluation.id)) throw new Error(`Evaluation renamed twice: ${evaluation.id}`);
      changes.set(evaluation.id, linked(evaluation,
        replaceOnce(evaluation.description, entry.source_label, reference, evaluation.id)));
      for (const result of input.filter((record) => record.kind === "result" &&
        record.links.some((link) => link.relation === "evaluation" && link.target_id === evaluation.id)))
        changes.set(result.id, linked(result, result.description));
    }
    if (entry.link) edges.push({ subject_id: subject.id, ...entry.link });
  }
  const renamed = [...input.map((record) => changes.get(record.id) || record), ...added];
  return applyModelEvaluationLinks(renamed, edges, reviewDate);
}

function batchFiles(directory = sourceLabelRoot) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, "review.json"), "utf8"));
  return Object.keys(receipt.files).map((name) => {
    if (name.includes("..") || path.isAbsolute(name)) throw new Error("Unsafe source-label input path");
    return path.join(directory, name);
  });
}

export function sourceLabelInputs() {
  return fs.existsSync(sourceLabelRoot) ? [path.join(sourceLabelRoot, "review.json"), ...batchFiles()] : [];
}

const readJsonl = (file: string) =>
  fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

export function addSourceLabelIdentities(records: RecordEntry[], directory = sourceLabelRoot): RecordEntry[] {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, "review.json"), "utf8"));
  if (receipt.method !== "automated_source_review" || receipt.outcome !== "pass" ||
      receipt.human_scientific_review !== "not_performed")
    throw new Error("Source-label identity review is not complete");
  for (const name of ["identities.json", "models.jsonl", "sources.jsonl", "retrievals.json"])
    if (!receipt.files[name]) throw new Error(`Source-label review does not cover ${name}`);
  const present = (fs.readdirSync(directory, { recursive: true }) as string[])
    .filter((name) => name !== "review.json" && fs.statSync(path.join(directory, name)).isFile());
  if (present.some((name) => !receipt.files[name])) throw new Error("Unreviewed source-label input");
  for (const file of batchFiles(directory)) {
    const name = path.relative(directory, file);
    if (sha(fs.readFileSync(file)) !== receipt.files[name])
      throw new Error(`Source-label input changed: ${name}`);
  }
  const sources = readJsonl(path.join(directory, "sources.jsonl"));
  const retrievals: { artifact_sha256: string; review_artifact: string }[] =
    JSON.parse(fs.readFileSync(path.join(directory, "retrievals.json"), "utf8"));
  const pinned = new Set([...records, ...sources.map((value) => recordSchema.parse(value))]
    .filter((record) => record.kind === "source")
    .map((record) => String(record.attributes.artifact_sha256)));
  for (const item of retrievals) {
    const name = path.relative(directory, item.review_artifact);
    if (!receipt.files[name] || sha(gunzipSync(fs.readFileSync(path.join(directory, name)))) !== item.artifact_sha256)
      throw new Error(`Source-label artifact mismatch: ${name}`);
    if (!pinned.has(item.artifact_sha256)) throw new Error(`Artifact has no catalogue source: ${name}`);
  }
  return applySourceLabelIdentities(
    records,
    JSON.parse(fs.readFileSync(path.join(directory, "identities.json"), "utf8")),
    readJsonl(path.join(directory, "models.jsonl")),
    sources,
  );
}
