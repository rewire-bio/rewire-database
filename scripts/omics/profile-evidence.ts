import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { profileSchema, validateProfileSources } from "../../lib/omics-profile";
import { recordSchema, type RecordEntry } from "./schema";
import { isModelSubject, isBenchmarkSubject } from "../../services/omics/src/entity-kinds";

const directory = "data/omics/reviewed/profile-evidence-2026-09-23";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const patchSchema = z.object({
  id: z.string().min(1),
  previous_profile_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  profile: z.unknown(),
}).strict();

/** A metadata review cannot change scientific results, identities or provenance. */
export function applyProfileEvidence(
  records: RecordEntry[],
  patches: unknown[],
  sources: unknown[],
): RecordEntry[] {
  const byId = new Map(records.map(record => [record.id, record]));
  const additional = sources.map(source => {
    const record = recordSchema.parse(source);
    if (record.kind !== "source" || byId.has(record.id))
      throw new Error(`Invalid or duplicate profile evidence source: ${record.id}`);
    if (!/^[a-f0-9]{64}$/.test(String(record.attributes.artifact_sha256)))
      throw new Error(`Unpinned profile evidence source: ${record.id}`);
    byId.set(record.id, record);
    return record;
  });
  const changes = new Map<string, RecordEntry>();
  for (const raw of patches) {
    const patch = patchSchema.parse(raw);
    const profile = profileSchema.parse(patch.profile);
    const record = byId.get(patch.id);
    if (!record?.attributes.profile || !(isModelSubject(record.kind) || isBenchmarkSubject(record.kind)))
      throw new Error(`Invalid profile evidence subject: ${patch.id}`);
    if (changes.has(patch.id)) throw new Error(`Duplicate profile evidence patch: ${patch.id}`);
    if (sha(JSON.stringify(record.attributes.profile)) !== patch.previous_profile_sha256)
      throw new Error(`Profile evidence precondition changed: ${patch.id}`);
    validateProfileSources(profile, byId);
    changes.set(record.id, {
      ...record,
      attributes: { ...record.attributes, profile },
    });
  }
  return [...records.map(record => changes.get(record.id) || record), ...additional];
}

export function profileEvidenceInputs() {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "review.json"), "utf8"));
  return [path.join(directory, "review.json"), ...Object.keys(manifest.files).map(name => {
    if (name.includes("..") || path.isAbsolute(name)) throw new Error("Unsafe profile evidence path");
    return path.join(directory, name);
  })];
}

export function addProfileEvidence(records: RecordEntry[]): RecordEntry[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "review.json"), "utf8"));
  if (manifest.method !== "automated_source_review" || manifest.outcome !== "pass")
    throw new Error("Profile evidence review is not complete");
  if (!manifest.files["patches.json"] || !manifest.files["sources.jsonl"])
    throw new Error("Profile evidence review does not cover its inputs");
  for (const file of profileEvidenceInputs().slice(1)) {
    const name = path.relative(directory, file);
    if (sha(fs.readFileSync(file)) !== manifest.files[name])
      throw new Error(`Profile evidence input changed: ${name}`);
  }
  return applyProfileEvidence(
    records,
    JSON.parse(fs.readFileSync(path.join(directory, "patches.json"), "utf8")),
    fs.readFileSync(path.join(directory, "sources.jsonl"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)),
  );
}
