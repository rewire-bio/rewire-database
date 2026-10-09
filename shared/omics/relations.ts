/** Catalogue relationships: one meaning per relation name.
 *
 * Until October 2026 several names meant different things on different kinds of record
 * (an evaluation's "model" link named what was evaluated, a baseline's named what implements
 * it) and evaluations used two link styles. Every relation below now has one meaning and a
 * fixed set of record kinds it may link from and to. Releases written with the older names
 * stay readable: normalizeRecords translates them once, when a snapshot is loaded, so the
 * rest of the code only sees current names. The store migration uses the same function. */
import {
  benchmarkSubjectKinds,
  datasetSubjectKinds,
  entityKinds,
  modelSubjectKinds,
} from "./entity-kinds.js";

type Kinds = readonly string[];
const any: Kinds = entityKinds;
const systems: Kinds = modelSubjectKinds;
const assessments: Kinds = benchmarkSubjectKinds;
const data: Kinds = datasetSubjectKinds;

/** Relation name to the kinds it links from and to, and what it means. */
export const relationRules = {
  system: { from: ["evaluation"], to: systems, meaning: "Evaluation to the configuration, model, method, pipeline or service it evaluated" },
  assessment: { from: ["evaluation"], to: assessments, meaning: "Evaluation to the task, protocol or benchmark it was assessed on" },
  data: { from: ["evaluation"], to: data, meaning: "Evaluation to the dataset or dataset subset it used" },
  evaluation: { from: ["result"], to: ["evaluation"], meaning: "Result to its evaluation" },
  original_evaluation: { from: ["evaluation"], to: ["evaluation"], meaning: "A copied evaluation to the evaluation it was copied from" },
  implemented_by: { from: ["baseline"], to: systems, meaning: "Baseline to what implements it" },
  measured_in: { from: ["baseline"], to: ["evaluation"], meaning: "Baseline to an evaluation that measured it as a comparator" },
  uses_data: { from: [...assessments, "baseline"], to: data, meaning: "Task, protocol or baseline to the data it uses" },
  used_in: { from: data, to: assessments, meaning: "Dataset subset to the protocol that uses it" },
  family: { from: systems, to: systems, meaning: "Configuration or model to its model family" },
  variant_of: { from: systems.filter((k) => k !== "configuration"), to: systems, meaning: "Model to the model it is a variant of" },
  configuration_of: { from: ["configuration"], to: systems, meaning: "Configuration to the model, method or pipeline it configures" },
  alias_of: { from: systems, to: systems, meaning: "Same identity under another ID; never merges results" },
  uses_model: { from: systems, to: systems, meaning: "Pipeline, service or configuration to a model it depends on" },
  part_of: { from: assessments, to: assessments, meaning: "Task or protocol to the benchmark or suite it is part of" },
  parent: { from: assessments, to: assessments, meaning: "Hierarchy within a benchmark" },
  evaluates_task: { from: assessments, to: assessments, meaning: "Benchmark or protocol to the task it evaluates" },
  applicable_to: { from: [...systems, "baseline"], to: [...assessments, "evaluator"], meaning: "Candidate applicability; not evidence of performance" },
  same_data_as: { from: data, to: data, meaning: "Informational data reuse; never merges results" },
  assessed_by: { from: ["use_case"], to: ["protocol"], meaning: "Use case to a protocol whose evaluations a reviewed relevance judgement claim rates as evidence for it" },
  supersedes: { from: any, to: any, meaning: "A newer record replacing an older one" },
  subject: { from: ["claim"], to: any, meaning: "Claim to the record it is about" },
  source: { from: any, to: ["source"], meaning: "Record to a source it is derived from" },
} as const satisfies Record<string, { from: Kinds; to: Kinds; meaning: string }>;

export type Relation = keyof typeof relationRules;
export const relations = Object.keys(relationRules) as Relation[];

export function relationAllows(relation: string, fromKind: string, toKind: string): boolean {
  const rule = (relationRules as Record<string, { from: Kinds; to: Kinds }>)[relation];
  return !!rule && rule.from.includes(fromKind) && rule.to.includes(toKind);
}

/** The current name of a link written before October 2026, given the kind it links from. */
export function currentRelation(fromKind: string, relation: string): string {
  if (fromKind === "evaluation") {
    if (relation === "model" || (systems as readonly string[]).includes(relation)) return "system";
    if (relation === "benchmark" || (assessments as readonly string[]).includes(relation)) return "assessment";
    if ((data as readonly string[]).includes(relation)) return "data";
  }
  if (fromKind === "baseline") {
    if (relation === "model" || (systems as readonly string[]).includes(relation)) return "implemented_by";
    if (relation === "evaluation") return "measured_in";
    if (relation === "dataset") return "uses_data";
  }
  if ((data as readonly string[]).includes(fromKind) && (relation === "benchmark" || relation === "protocol"))
    return "used_in";
  if ((assessments as readonly string[]).includes(fromKind) && relation === "dataset") return "uses_data";
  if (fromKind === "configuration" && relation === "variant_of") return "configuration_of";
  return relation;
}

type Link = { relation: string; target_id: string };
type LinkedRecord = { id: string; kind: string; links: Link[]; attributes: Record<string, unknown> };

/** Rename older relation names in records and in the claim fields that cite them
 * ("links:<relation>:<target>"). Returns the same array when nothing needed changing, and
 * never mutates its input. */
export function normalizeRecords<T extends LinkedRecord>(records: T[]): T[] {
  const kindOf = new Map(records.map((record) => [record.id, record.kind]));
  let changed = false;
  const out = records.map((record) => {
    let next = record;
    if (record.links.some((link) => currentRelation(record.kind, link.relation) !== link.relation)) {
      next = {
        ...record,
        links: record.links.map((link) => ({ ...link, relation: currentRelation(record.kind, link.relation) })),
      };
    }
    const field = record.attributes.field;
    if (record.kind === "claim" && typeof field === "string" && field.startsWith("links:")) {
      const [, relation, ...rest] = field.split(":");
      const subjects = record.links.filter((link) => link.relation === "subject");
      const subjectKind = subjects.length === 1 ? kindOf.get(subjects[0].target_id) : undefined;
      const renamed = subjectKind ? currentRelation(subjectKind, relation) : relation;
      if (renamed !== relation)
        next = { ...next, attributes: { ...next.attributes, field: ["links", renamed, ...rest].join(":") } };
    }
    if (next !== record) changed = true;
    return next;
  });
  return changed ? out : records;
}
