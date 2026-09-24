import fs from "node:fs";
import { citationOnlyName, sourceLabel } from "../../../services/omics/src/source-identity";

/** Reproducible audit for author-year citations or bibliography labels used as
 * tested model, method, configuration, pipeline, service or baseline names. */
export const auditedKinds = ["model", "method", "configuration", "pipeline", "service", "baseline"] as const;
export const citationPatterns: Record<string, RegExp> = {
  bracketed_author_year: citationOnlyName,
  et_al: /\bet al\b/i,
  parenthetical_author_year: /\([A-Z][^()]*\b(1[89]|20)\d{2}[a-z]?\)/,
  trailing_year: /^[A-Z][\p{L}'-]+( (and|&) [A-Z][\p{L}'-]+)?,? \(?(1[89]|20)\d{2}[a-z]?\)?$/u,
  numeric_reference: /\[\d+([,–-]\s*\d+)*\]/,
  ref_marker: /\bref\.?\s*\d+/i,
  attribution_suffix: /\((?:[A-Z][\p{L}'-]+)(?: et al\.?| and [A-Z][\p{L}'-]+)\)/u,
};

/** Author-surname shorthand cannot be found by pattern without guessing. These
 * names were found by the independent semantic audit of release
 * 2026-09-23-5fd75097e2dd and are listed so every rerun reports their state. */
export const reviewerIdentifiedShorthand = ["discovery-model-tape-bepler", "hest-method-ciga"];

type AuditRecord = { id: string; kind: string; name: string; status: string; attributes: Record<string, unknown> };

export function auditSourceLabelNames(records: AuditRecord[], shorthand = reviewerIdentifiedShorthand) {
  const hits = records
    .filter((record) => (auditedKinds as readonly string[]).includes(record.kind))
    .flatMap((record) => {
      const label = sourceLabel(record);
      const patterns = Object.entries(citationPatterns)
        .filter(([, pattern]) => pattern.test(record.name) || (label !== undefined && pattern.test(label)))
        .map(([name]) => name);
      if (shorthand.includes(record.id)) patterns.push("reviewer_identified_shorthand");
      if (!patterns.length) return [];
      const identity = record.attributes.source_identity as { status?: string } | undefined;
      return [{
        id: record.id,
        kind: record.kind,
        name: record.name,
        source_label: label ?? null,
        patterns,
        citation_only: citationOnlyName.test(record.name),
        identity_status: identity?.status ?? null,
      }];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const audited = records.filter((record) => (auditedKinds as readonly string[]).includes(record.kind));
  return {
    audited_records: audited.length,
    audited_by_kind: Object.fromEntries(auditedKinds.map((kind) => [kind, audited.filter((record) => record.kind === kind).length])),
    patterns: Object.fromEntries(Object.entries(citationPatterns).map(([name, pattern]) => [name, pattern.source])),
    hits,
    citation_only_without_identity: hits.filter((hit) => hit.citation_only && !hit.identity_status).map((hit) => hit.id),
    shorthand_without_identity: hits
      .filter((hit) => hit.patterns.includes("reviewer_identified_shorthand") && !hit.identity_status)
      .map((hit) => hit.id),
  };
}

if (process.argv[1]?.endsWith("source-label-names.ts")) {
  const file = process.argv[2] || "public/omics/catalogue.json";
  const catalogue = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = auditSourceLabelNames(catalogue.records);
  console.log(JSON.stringify({ release_id: catalogue.release_id, ...result }, null, 2));
}
