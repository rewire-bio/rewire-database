import { z } from "zod";
import { modelSubjectKinds } from "./entity-kinds.js";

/** A source prints a citation where the tested method's name belongs. The
 * reviewed identity supplies a readable display name; the printed label stays
 * in `attributes.source_label` for audit and search. */
const text = z.string().trim().min(1);
export const identityDetailSchema = z
  .object({
    label: text,
    value: text,
    source_ids: z.array(text).min(1),
    source_locator: text,
  })
  .strict();
export const identityUnknownSchema = z.object({ label: text, note: text }).strict();
/** Label forms a reviewer may declare. Only explicit reviewed entries are renamed. */
export const labelForms = ["bracketed_citation", "author_surname"] as const;
export const subjectIdentitySchema = z
  .object({
    status: z.enum(["resolved", "unresolved"]),
    label_form: z.enum(labelForms),
    display_name: text,
    identity: text.nullable(),
    configuration: text.nullable(),
    basis: text,
    source_ids: z.array(text).min(1),
    source_locator: text,
    known_details: z.array(identityDetailSchema),
    unknown: z.array(identityUnknownSchema).min(1),
    original_name: text,
    original_description: z.string(),
    review: z
      .object({
        method: z.literal("automated_source_review"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: text,
      })
      .strict(),
  })
  .strict();
export const linkedIdentitySchema = z
  .object({
    status: z.enum(["resolved", "unresolved"]),
    display_name: text,
    subject_id: text,
    original_name: text,
    original_description: z.string(),
  })
  .strict();
export type SubjectIdentity = z.infer<typeof subjectIdentitySchema>;
export type LinkedIdentity = z.infer<typeof linkedIdentitySchema>;

type IdentityRecord = {
  id: string;
  kind: string;
  name: string;
  description: string;
  facets: Record<string, string[]>;
  links: { relation: string; target_id: string }[];
  attributes: Record<string, unknown>;
};

/** Bracketed author-year labels such as "[Karimi et al., 2019]". */
export const citationOnlyName = /^\[[^\]]*\b(1[89]|20)\d{2}[a-z]?\]$/;
/** A single printed surname such as "Ciga". Matching it proves nothing on its
 * own; it only checks the shape of a label a reviewer has already identified. */
export const authorSurname = /^\p{Lu}[\p{L}'’-]+$/u;
export function matchesLabelForm(label: string, form: (typeof labelForms)[number]) {
  return form === "bracketed_citation" ? citationOnlyName.test(label) : authorSurname.test(label);
}

export function sourceLabel(record: Pick<IdentityRecord, "attributes">) {
  const label = record.attributes.source_label;
  return typeof label === "string" && label ? label : undefined;
}

/** Text matched by catalogue, browse and chart searches. Printed source labels
 * remain searchable after a record is given a readable display name. */
export function recordSearchText(record: IdentityRecord) {
  return [
    record.id,
    record.name,
    record.description,
    ...Object.values(record.facets).flat(),
    sourceLabel(record) || "",
  ]
    .join(" ")
    .toLowerCase();
}

/** Publication contract for records renamed by a reviewed source-label identity.
 * Evaluations and results must reach their subject through the record graph. */
export function validateSourceIdentity(
  record: IdentityRecord,
  records: Map<string, Pick<IdentityRecord, "id" | "kind" | "name" | "links" | "attributes">>,
) {
  const value = record.attributes.source_identity;
  const label = sourceLabel(record);
  if (value === undefined && label === undefined) return;
  const fail = (message: string): never => {
    throw new Error(`Invalid source identity on ${record.id}: ${message}`);
  };
  if (!label || value === undefined) fail("label and identity must appear together");
  if (record.name !== (value as { display_name?: unknown }).display_name)
    fail("record name must equal the display name");
  if (citationOnlyName.test(record.name) || record.name === label)
    fail("display name is citation-only");
  if ((modelSubjectKinds as readonly string[]).includes(record.kind)) {
    const identity = subjectIdentitySchema.parse(value);
    if (!matchesLabelForm(label!, identity.label_form)) fail("label does not match its declared form");
    if (identity.original_name !== label) fail("original name must be the printed source label");
    if (identity.status === "unresolved") {
      if (identity.identity !== null || !record.name.includes(label!))
        fail("an unresolved identity must retain the source label and name no method");
    } else if (!identity.identity) fail("a resolved identity needs a method name");
    for (const id of [
      ...identity.source_ids,
      ...identity.known_details.flatMap((item) => item.source_ids),
    ])
      if (records.get(id)?.kind !== "source") fail(`missing source ${id}`);
    return;
  }
  if (!["evaluation", "result"].includes(record.kind))
    fail(`unsupported kind ${record.kind}`);
  const linked = linkedIdentitySchema.parse(value);
  if (linked.subject_id === record.id) fail("identity cannot cite its own record");
  const subject = records.get(linked.subject_id);
  if (!subject || !(modelSubjectKinds as readonly string[]).includes(subject.kind))
    fail("identity subject must be a tested model, method, configuration, pipeline or service");
  const subjectIdentity = subjectIdentitySchema.safeParse(subject!.attributes.source_identity);
  if (
    !subjectIdentity.success ||
    sourceLabel(subject!) !== label ||
    subjectIdentity.data.status !== linked.status ||
    !record.name.includes(subject!.name)
  )
    fail("linked identity does not match its tested subject");
  if (!linked.original_name.includes(label!)) fail("original name lost the source label");
  const testsSubject = (evaluation: Pick<IdentityRecord, "links">) =>
    evaluation.links.some(
      (link) =>
        link.relation === "system" &&
        link.target_id === linked.subject_id,
    );
  if (record.kind === "evaluation") {
    if (!testsSubject(record)) fail("evaluation does not test the identity subject");
    return;
  }
  const evaluations = record.links
    .filter((link) => link.relation === "evaluation")
    .map((link) => records.get(link.target_id));
  if (
    !evaluations.length ||
    evaluations.some(
      (evaluation) =>
        !evaluation ||
        evaluation.kind !== "evaluation" ||
        !testsSubject(evaluation) ||
        (evaluation.attributes.source_identity as { subject_id?: unknown } | undefined)
          ?.subject_id !== linked.subject_id,
    )
  )
    fail("result is not linked to an evaluation of the identity subject");
}
