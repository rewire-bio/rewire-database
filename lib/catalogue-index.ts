import { socialMetadata } from "./catalogue-sharing";
import { catalogueText } from "./catalogue-text";
import type { Metadata } from "next";
import type { OmicsRecord } from "./omics";

export type IndexKind = "model" | "benchmark";
export const MODEL_PAGE_SIZE = 24;
export const CATALOGUE_ORIGIN = "https://benchmarks.rewirebio.io";

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
