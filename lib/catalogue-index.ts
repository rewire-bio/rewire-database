import { socialMetadata } from "./catalogue-sharing";
import { catalogueText } from "./catalogue-text";
import type { Metadata } from "next";
import type { OmicsRecord } from "./omics";

export type IndexKind = "model" | "benchmark";
export const MODEL_PAGE_SIZE = 24;
export const CATALOGUE_ORIGIN = "https://benchmarks.rewirebio.io";

/** The records an index lists: the set the database search lists and counts.
 * A verified alias is the same entity under a historical ID; its page stays
 * reachable, but listing it would show the entity twice. */
export function withoutVerifiedAliases<T extends Pick<OmicsRecord, "id" | "kind" | "links">>(
  records: T[],
  verified: (subject: string, relation: string, target: string) => boolean,
): T[] {
  const kinds = new Map(records.map((record) => [record.id, record.kind]));
  return records.filter((record) => !record.links.some((link) =>
    link.relation === "alias_of" && kinds.get(link.target_id) === record.kind && verified(record.id, "alias_of", link.target_id)));
}
export function indexSource(
  query: { recordsOfKind(kind: string): unknown[]; verifiedAssociation(subject: string, relation: string, target: string): boolean },
  kind: IndexKind,
) {
  return withoutVerifiedAliases(query.recordsOfKind(kind) as OmicsRecord[], query.verifiedAssociation);
}

/** Exact entity kinds only: configurations, tasks and protocols remain separate. */
export function indexRecords(records: OmicsRecord[], kind: IndexKind) {
  return records.filter((record) => record.kind === kind && record.status !== "excluded")
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id, "en"));
}
export function modelPageCount(records: OmicsRecord[]) {
  return Math.max(1, Math.ceil(indexRecords(records, "model").length / MODEL_PAGE_SIZE));
}
export function modelIndexHref(page = 1) {
  return page === 1 ? "/models/" : `/models/page/${page}/`;
}
export function catalogueIndexPaths(records: OmicsRecord[]) {
  return ["/benchmarks/", ...Array.from({ length: modelPageCount(records) }, (_, index) => modelIndexHref(index + 1))];
}
export function validModelPage(value: string, records: OmicsRecord[]) {
  return /^[1-9][0-9]*$/.test(value) && Number(value) >= 2 && Number.isSafeInteger(Number(value)) && Number(value) <= modelPageCount(records);
}
export function indexMetadata(kind: IndexKind, page = 1): Metadata {
  const benchmark = kind === "benchmark";
  const metadata = {
    title: benchmark ? "Biological benchmarks: procedures, results and sources" : `Biological models: architectures and benchmark results${page > 1 ? ` | Page ${page}` : ""}`,
    description: benchmark
      ? "Browse biological benchmark suites and challenges, with procedures, linked model evaluations and source evidence. Tasks and protocols remain distinct."
      : `Browse specialist biological model profiles, architectures, access requirements and linked evaluations.${page > 1 ? ` Page ${page} of the alphabetical model index.` : ""}`,
    alternates: { canonical: CATALOGUE_ORIGIN + (benchmark ? "/benchmarks/" : modelIndexHref(page)) },
  };
  return { ...metadata, ...socialMetadata({ title: metadata.title, description: metadata.description, path: metadata.alternates.canonical }) };
}
export function indexSummary(record: OmicsRecord) {
  const profile = record.attributes.profile as { summary?: unknown } | undefined;
  return catalogueText(typeof profile?.summary === "string" && profile.summary.trim() ? profile.summary : record.description || "Read the profile for available evidence and documented gaps.");
}
