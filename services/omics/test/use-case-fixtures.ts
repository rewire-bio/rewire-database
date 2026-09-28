import { createHash, randomUUID } from "node:crypto";
import { fixture } from "./fixtures.js";
import {
  buildUseCaseArtifact,
  mappingEvidenceHash,
  useCaseDeclaration,
  type UseCaseInputs,
} from "../src/use-cases.js";
import { validateSnapshot } from "../src/validation.js";

export const sha = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
export function useCaseFixture(count = 2) {
  const snapshot = fixture();
  snapshot.schema_version = "1.1";
  snapshot.release_id = `2026-09-25-${sha(randomUUID()).slice(0, 12)}`;
  snapshot.records.find((record: any) => record.id === "model-one").kind =
    "configuration";
  snapshot.records.find((record: any) => record.id === "benchmark-one").kind =
    "protocol";
  snapshot.records.find((record: any) => record.id === "evaluation-one").links =
    [
      { relation: "configuration", target_id: "model-one" },
      { relation: "protocol", target_id: "benchmark-one" },
      { relation: "dataset", target_id: "dataset-one" },
    ];
  for (const record of snapshot.records) record.status = "source_checked";
  const review = {
    method: "automated_source_review" as const,
    actor: "service-test",
    reviewed_at: "2026-09-25T00:00:00Z",
    note: "Synthetic source review for service tests.",
  };
  const citation = {
    source_id: "source-one",
    locator: "Synthetic methods, Table 1",
  };
  const inputs: UseCaseInputs = {
    schema_version: "1.0",
    use_cases: [],
    mappings: [],
  };
  for (let n = 0; n < count; n++) {
    const entry: UseCaseInputs["use_cases"][number] = {
      id: `use-case-${n}`,
      slug: `prioritise-variants-${n}`,
      title: `Prioritise variants ${n}`,
      question: "Which variants warrant a follow-up assay?",
      area: "genomics",
      contexts: ["research"],
      search_terms: ["splicing", "assay"],
      intended_users: ["Experimental researcher"],
      decision: "Choose a method to investigate.",
      inputs: ["Sequence variants"],
      output: "A research ranking",
      setting: "Synthetic assay",
      exclusions: ["Patient care"],
      clinical_scope: "Clinical applicability has not been established.",
      evidence_gaps: ["No clinical validation"],
      citations: [citation],
      review,
      planned_work: [],
    };
    const mapping: UseCaseInputs["mappings"][number] = {
      id: `mapping-${n}`,
      use_case_id: entry.id,
      lifecycle: "active",
      revision: 1,
      reason: "Initial synthetic evidence review",
      protocol_id: "benchmark-one",
      evaluation_ids: ["evaluation-one"],
      endpoint: "Synthetic assay ranking",
      relevance: "proxy",
      rationale: "The assay is a proxy for follow-up prioritisation.",
      constraints: ["Synthetic cohort only"],
      limitations: ["No clinical interpretation"],
      citations: [citation],
      review,
    };
    mapping.evidence_sha256 = mappingEvidenceHash(snapshot, entry, mapping);
    inputs.use_cases.push(entry);
    inputs.mappings.push(mapping);
  }
  return useCaseRelease(snapshot, inputs);
}

export function useCaseRelease(
  snapshot: ReturnType<typeof fixture>,
  inputs: UseCaseInputs,
) {
  const declaration = useCaseDeclaration(inputs);
  snapshot.coverage.use_cases = declaration;
  const validated = validateSnapshot(snapshot);
  const artifact = buildUseCaseArtifact(validated, inputs);
  const bytes = Buffer.from(JSON.stringify(validated));
  const artifactBytes = Buffer.from(JSON.stringify(artifact));
  const manifest = {
    release_id: validated.release_id,
    schema_version: validated.schema_version,
    coverage: validated.coverage,
    files: {
      "catalogue.json": sha(bytes),
      "use-cases.json": sha(artifactBytes),
    },
  };
  return {
    snapshot: validated,
    inputs,
    artifact,
    declaration,
    bytes,
    manifest,
    files: { "use-cases.json": artifactBytes },
    id: validated.release_id,
  };
}
