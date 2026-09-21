import { isModelSubject } from "../services/omics/src/entity-kinds";
import type { OmicsCatalogue, OmicsRecord } from "./omics";

export type BaselineRole = "null" | "conventional";
export type CoverageStatus = "measured" | "selection_required" | "historical";
export interface BaselineCoverageRow {
  protocol_id: string;
  protocol_name: string;
  protocol_status: string;
  suite_ids: string[];
  role: BaselineRole;
  status: CoverageStatus;
  candidate: string;
  candidate_basis: "reviewed_evaluation" | "editorial_selection_rule";
  selection_review: "existing_release_evidence" | "not_reviewed";
  blocker: string | null;
  evaluation_ids: string[];
  result_ids: string[];
  dataset_ids: string[];
  source_ids: string[];
  source_locator: string | null;
  context_source_ids: string[];
  execution_scope: string | null;
  resource_estimate: null;
}
export interface ModelEvaluationRow {
  record_id: string;
  name: string;
  kind: string;
  record_status: string;
  declared_version: string | null;
  checkpoint_identity_status: "requires_review";
  decision:
    | "existing_rewire_evaluation"
    | "compatibility_review_required"
    | "historical";
  review_note: string;
  verified_associations: {
    relation: string;
    target_id: string;
    claim_id: string;
  }[];
  evaluation_ids: string[];
  rewire_evaluation_ids: string[];
  evaluated_protocol_ids: string[];
  proposed_test_ids: string[];
  result_ids: string[];
  source_ids: string[];
  access_requirements: string[];
  resource_estimate: null;
  submission_status: "not_recorded_in_public_catalogue";
}
export interface BaselineAudit {
  schema_version: "1.0";
  release_id: string;
  release_date: string;
  interpretation: string;
  protocols: BaselineCoverageRow[];
  suites: {
    id: string;
    name: string;
    protocol_ids: string[];
    measured_roles: number;
    required_roles: number;
    status:
      | "incomplete"
      | "both_roles_measured"
      | "protocol_inventory_required";
  }[];
  models: ModelEvaluationRow[];
  counts: Record<string, number>;
}

// Exact evaluated identities only. No method-name heuristics can establish a run.
const measured: Record<
  string,
  Partial<Record<BaselineRole, { evaluation: string; locator: string }>>
> = {
  "rewire-mfass-v2": {
    conventional: {
      evaluation: "rewire-evaluation-baseline-kmer-position-v2",
      locator:
        "benchmarks/mfass/results/baseline-kmer-position-v2.json at bee9133b83f3aedaf2bbb9013f1875515845607e; existing release results and corrected split-v2",
    },
  },
  "rewire-protocol-flip2-rhomax-by-wild-type-v1": {
    null: {
      evaluation: "rewire-local-20260920-evaluation-flip2-train-mean",
      locator:
        "Pinned local-runs-2026-09-20 report: FLIP2 train-mean metrics, coverage and protocol_results",
    },
    conventional: {
      evaluation: "rewire-local-20260920-evaluation-flip2-composition",
      locator:
        "Pinned local-runs-2026-09-20 report: FLIP2 composition metrics, coverage and protocol_results",
    },
  },
  "rewire-protocol-mrnabench-designed-mrl-v1": {
    null: {
      evaluation: "rewire-local-20260920-evaluation-mrnabench-train-mean",
      locator:
        "Pinned local-runs-2026-09-20 report: mRNABench train-mean metrics, coverage and protocol_results",
    },
    conventional: {
      evaluation: "rewire-local-20260920-evaluation-mrnabench-composition",
      locator:
        "Pinned local-runs-2026-09-20 report: mRNABench composition metrics, coverage and protocol_results",
    },
  },
};
const accepted = (record: OmicsRecord) =>
  ["source_checked", "reproduced"].includes(record.status);
const sorted = (items: string[]) => [...new Set(items)].sort();
const roles: BaselineRole[] = ["null", "conventional"];
const linksTo = (record: OmicsRecord, ids: Set<string>) =>
  record.links.some((link) => ids.has(link.target_id));

/** Selection suggestions are hypotheses for review, never validation of applicability. */
export function candidateRule(
  protocol: OmicsRecord,
  suites: OmicsRecord[],
): [string, string] {
  // Suite titles do not establish this protocol's supervision or modality.
  // Keep the parameter for callers supplying context, but never classify by it.
  void suites;
  const text = [protocol.name, protocol.description].join(" ").toLowerCase();
  if (/zero.shot/.test(text))
    return [
      "Protocol-valid seeded random ranking; no fitting on assay labels",
      "Established label-free reference with explicitly permitted sequence/MSA inputs",
    ];
  if (/batch|integration|scib/.test(text))
    return [
      "Unintegrated representation using protocol preprocessing",
      "Protocol-specific conventional integration method",
    ];
  if (/perturb|virtual cell/.test(text))
    return [
      "No-change prediction under matched control conditions",
      "Training-only mean-effect or linear prediction",
    ];
  if (/rna.*structur|rna.*fold/.test(text))
    return [
      "Protocol-valid structural control",
      "Thermodynamic folding with protocol-compatible input constraints",
    ];
  if (/beeline|network inference/.test(text))
    return [
      "Seeded random network with matched node universe and density",
      "Upstream statistical network inference reference",
    ];
  if (/petab|mechanistic|metabolic/.test(text))
    return [
      "Protocol-defined reference parameterisation",
      "Established solver with matched constraints and initialisation",
    ];
  if (
    /casp|capri|plinder|posebuster|proteinbench|docking|co.fold|structure/.test(
      text,
    )
  )
    return [
      "Protocol-specific valid geometric or structural control",
      "Upstream conventional structural reference with matched templates and cutoffs",
    ];
  if (/cami|microb|metagenom/.test(text))
    return [
      "Protocol-valid abundance or assignment control",
      "Conventional reference-database method with pinned taxonomy/database",
    ];
  if (/classif|mfass|splice|cafa/.test(text))
    return [
      "Training-set class prior where supervised fitting is permitted",
      "Regularised classifier on simple permitted features, or protocol's conventional reference",
    ];
  if (/regress|flip|mrnabench|mrl|rhomax|fitness/.test(text))
    return [
      "Training-set mean where supervised fitting is permitted",
      "Simple features with train-only ridge regression",
    ];
  return [
    "Select a task-valid null control after reviewing inputs and metric",
    "Select an upstream conventional reference after reviewing the full protocol",
  ];
}

/** Derived audit only: never modifies scientific records or promotes metadata review. */
export function buildBaselineAudit(catalogue: OmicsCatalogue): BaselineAudit {
  const records = [...catalogue.records]
    .filter((r) => r.status !== "excluded")
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length)
    throw new Error("Duplicate catalogue identity");
  const evaluations = records.filter((r) => r.kind === "evaluation");
  const resultsByEvaluation = new Map<string, OmicsRecord[]>();
  const evaluationsBySubject = new Map<string, OmicsRecord[]>();
  for (const evaluation of evaluations)
    for (const link of evaluation.links) {
      const existing = evaluationsBySubject.get(link.target_id) || [];
      existing.push(evaluation);
      evaluationsBySubject.set(link.target_id, existing);
    }
  for (const result of records.filter(
    (r) => r.kind === "result" && accepted(r),
  ))
    for (const link of result.links.filter(
      (l) => l.relation === "evaluation",
    )) {
      const existing = resultsByEvaluation.get(link.target_id) || [];
      existing.push(result);
      resultsByEvaluation.set(link.target_id, existing);
    }
  const suites = records.filter((r) => r.kind === "benchmark");
  const suiteIds = new Set(suites.map((s) => s.id));
  // Only explicit membership edges. Shared topics/tasks do not prove suite membership.
  function parentSuites(
    record: OmicsRecord,
    seen = new Set<string>(),
  ): string[] {
    if (seen.has(record.id)) return [];
    seen.add(record.id);
    return sorted(
      record.links
        .filter((l) => l.relation === "part_of")
        .flatMap((l) => {
          const target = byId.get(l.target_id);
          return suiteIds.has(l.target_id)
            ? [l.target_id]
            : target && ["protocol", "task", "evaluator"].includes(target.kind)
              ? parentSuites(target, seen)
              : [];
        }),
    );
  }
  const protocols: BaselineCoverageRow[] = records
    .filter((r) => r.kind === "protocol")
    .flatMap((protocol) => {
      const parents = parentSuites(protocol);
      const candidates = candidateRule(
        protocol,
        parents.map((id) => byId.get(id)!),
      );
      const related = evaluationsBySubject.get(protocol.id) || [];
      const datasetIds = sorted(
        related.flatMap((ev) =>
          ev.links
            .filter((l) =>
              ["dataset", "dataset_subset"].includes(
                byId.get(l.target_id)?.kind || "",
              ),
            )
            .map((l) => l.target_id),
        ),
      );
      return roles.map((role, index): BaselineCoverageRow => {
        const mapping = measured[protocol.id]?.[role];
        const evaluation = mapping && byId.get(mapping.evaluation);
        const results = evaluation
          ? resultsByEvaluation.get(evaluation.id) || []
          : [];
        if (
          mapping &&
          (!evaluation ||
            evaluation.kind !== "evaluation" ||
            evaluation.attributes.origin !== "rewire_run" ||
            !accepted(evaluation) ||
            !linksTo(evaluation, new Set([protocol.id])) ||
            !results.length ||
            !evaluation.source_ids.length)
        )
          throw new Error(`Invalid baseline evidence: ${protocol.id}/${role}`);
        const historical = protocol.status === "superseded";
        const model = evaluation?.links
          .map((l) => byId.get(l.target_id))
          .find((r) => r && isModelSubject(r.kind));
        return {
          protocol_id: protocol.id,
          protocol_name: protocol.name,
          protocol_status: protocol.status,
          suite_ids: parents,
          role,
          status: historical
            ? "historical"
            : evaluation
              ? "measured"
              : "selection_required",
          candidate: model?.name || candidates[index],
          candidate_basis: evaluation
            ? "reviewed_evaluation"
            : "editorial_selection_rule",
          selection_review: evaluation
            ? "existing_release_evidence"
            : "not_reviewed",
          blocker: historical
            ? "Superseded protocol: retain history; do not start new runs."
            : evaluation
              ? null
              : "Protocol-specific applicability, permitted inputs, access, split, evaluator and execution requirements need review before implementation or execution.",
          evaluation_ids: evaluation ? [evaluation.id] : [],
          result_ids: sorted(results.map((r) => r.id)),
          dataset_ids: datasetIds,
          source_ids: evaluation
            ? sorted([
                ...evaluation.source_ids,
                ...results.flatMap((r) => r.source_ids),
              ])
            : [],
          source_locator: mapping?.locator || null,
          context_source_ids: sorted(protocol.source_ids),
          execution_scope: evaluation
            ? String(
                evaluation.attributes.execution_scope ||
                  "Recorded evaluation only; consult coverage and source artifacts",
              )
            : null,
          resource_estimate: null,
        };
      });
    });
  const claims = records.filter(
    (r) =>
      r.kind === "claim" &&
      accepted(r) &&
      typeof r.attributes.source_locator === "string" &&
      r.source_ids.length,
  );
  const models: ModelEvaluationRow[] = records
    .filter((r) => isModelSubject(r.kind))
    .map((record) => {
      const ownEvaluations = evaluationsBySubject.get(record.id) || [];
      const ownRewire = ownEvaluations.filter(
        (ev) =>
          accepted(ev) &&
          ev.attributes.origin === "rewire_run" &&
          (resultsByEvaluation.get(ev.id)?.length || 0) > 0,
      );
      const associations = record.links
        .filter((l) =>
          ["family", "variant_of", "alias_of", "uses_model"].includes(
            l.relation,
          ),
        )
        .flatMap((link) => {
          const claim = claims.find(
            (c) =>
              c.links.some(
                (l) => l.relation === "subject" && l.target_id === record.id,
              ) &&
              c.attributes.field === `links:${link.relation}:${link.target_id}`,
          );
          return claim
            ? [
                {
                  relation: link.relation,
                  target_id: link.target_id,
                  claim_id: claim.id,
                },
              ]
            : [];
        });
      const profile = record.attributes.profile as
        | { facts?: { label: string; value: string; status?: string }[] }
        | undefined;
      return {
        record_id: record.id,
        name: record.name,
        kind: record.kind,
        record_status: record.status,
        declared_version:
          typeof record.attributes.version === "string"
            ? record.attributes.version
            : null,
        checkpoint_identity_status: "requires_review",
        decision:
          record.status === "superseded"
            ? "historical"
            : ownRewire.length
              ? "existing_rewire_evaluation"
              : "compatibility_review_required",
        review_note:
          "Exact-record inventory. Names do not prove checkpoint identity or compatibility. Family, variant and pipeline links do not transfer results. Access facts retain their original review status; resources and submission status require separate checks.",
        verified_associations: associations,
        evaluation_ids: sorted(ownEvaluations.map((r) => r.id)),
        rewire_evaluation_ids: sorted(ownRewire.map((r) => r.id)),
        evaluated_protocol_ids: sorted(
          ownEvaluations.flatMap((ev) =>
            ev.links
              .filter((l) => byId.get(l.target_id)?.kind === "protocol")
              .map((l) => l.target_id),
          ),
        ),
        proposed_test_ids: sorted(
          record.links
            .filter((l) => l.relation === "applicable_to")
            .map((l) => l.target_id),
        ),
        result_ids: sorted(
          ownEvaluations.flatMap((ev) =>
            (resultsByEvaluation.get(ev.id) || []).map((r) => r.id),
          ),
        ),
        source_ids: sorted([
          ...record.source_ids,
          ...associations.flatMap(
            (a) => byId.get(a.claim_id)?.source_ids || [],
          ),
        ]),
        access_requirements: (profile?.facts || [])
          .filter((f) => /access|licen[cs]e|weights/i.test(f.label))
          .map((f) => `${f.label}: ${f.value} [${f.status || "unreported"}]`),
        resource_estimate: null,
        submission_status: "not_recorded_in_public_catalogue",
      };
    });
  const suiteCoverage = suites.map((suite) => {
    const rows = protocols.filter((row) => row.suite_ids.includes(suite.id));
    const active = rows.filter((row) => row.status !== "historical");
    const measuredCount = active.filter(
      (row) => row.status === "measured",
    ).length;
    return {
      id: suite.id,
      name: suite.name,
      protocol_ids: sorted(rows.map((r) => r.protocol_id)),
      measured_roles: measuredCount,
      required_roles: active.length,
      status: !rows.length
        ? ("protocol_inventory_required" as const)
        : active.length > 0 && measuredCount === active.length
          ? ("both_roles_measured" as const)
          : ("incomplete" as const),
    };
  });
  return {
    schema_version: "1.0",
    release_id: catalogue.release_id,
    release_date: catalogue.released_at,
    interpretation:
      "Machine-derived coverage inventory with editorial selection suggestions. Context sources do not validate baseline choices. Measured links reuse accepted exact evaluations in this release, not new execution or independent review. No name-based deduplication or inferred suite membership. Private submission state is deliberately absent.",
    protocols,
    suites: suiteCoverage,
    models,
    counts: {
      protocols: protocols.length / 2,
      suites: suites.length,
      model_records: models.filter((m) => m.kind === "model").length,
      exact_model_method_configuration_records: models.length,
      measured_roles: protocols.filter((p) => p.status === "measured").length,
      selection_required_roles: protocols.filter(
        (p) => p.status === "selection_required",
      ).length,
      historical_roles: protocols.filter((p) => p.status === "historical")
        .length,
      protocols_without_explicit_suite:
        protocols.filter((p) => !p.suite_ids.length).length / 2,
      models_with_rewire_evaluations: models.filter(
        (m) => m.rewire_evaluation_ids.length,
      ).length,
    },
  };
}
