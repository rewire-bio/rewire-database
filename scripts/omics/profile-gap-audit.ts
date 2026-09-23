import fs from "node:fs";
import path from "node:path";
import type { CatalogueSnapshot } from "../../services/omics/src/catalogue-query";
import { profileSchema } from "../../services/omics/src/profile-schema";

const missingStates = new Set(["unreported", "unextracted", "unavailable", "inapplicable"]);
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const csv = (rows: Record<string, unknown>[]) => {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.map(cell).join(","), ...rows.map(row => keys.map(key => cell(row[key])).join(","))].join("\n") + "\n";
};

/** Inventory the release's recorded gaps, without claiming a new source review. */
export function profileGapAudit(snapshot: CatalogueSnapshot) {
  const facts: Record<string, unknown>[] = [];
  const gaps: Record<string, unknown>[] = [];
  for (const record of snapshot.records) {
    if (record.attributes.profile) {
      const profile = profileSchema.parse(record.attributes.profile);
      for (const fact of profile.facts) facts.push({
        record_id: record.id, kind: record.kind, name: record.name,
        field: fact.label, status: fact.status ?? "unextracted", value: fact.value,
        source_ids: fact.source_ids.join(";"), source_locator: fact.source_locator,
        review_method: profile.review.method, review_date: profile.review.date,
      });
    }
    // These are declared missingness states, not conclusions inferred from names.
    for (const [field, status] of Object.entries(object(record.attributes.missing_metadata))) {
      if (typeof status === "string" && missingStates.has(status)) gaps.push({
        record_id: record.id, kind: record.kind, field, status,
        source_ids: record.source_ids.join(";"),
        source_locator: record.attributes.source_locator ?? "Not recorded at record level",
      });
    }
    if (record.kind === "result") {
      for (const field of ["eligible_count", "scored_count", "uncertainty"]) {
        const value = record.attributes[field];
        if (value !== undefined && value !== null) continue;
        const declared = object(record.attributes.missing_metadata)[field];
        if (typeof declared === "string" && missingStates.has(declared)) continue;
        gaps.push({ record_id: record.id, kind: record.kind, field,
          status: "unextracted", source_ids: record.source_ids.join(";"),
          source_locator: record.attributes.source_locator ?? "Not recorded at record level",
          note: "Absent in this release; source reporting has not been determined by this inventory.",
        });
      }
    }
  }
  const count = (rows: Record<string, unknown>[], field: string) =>
    rows.reduce<Record<string, number>>((out, row) => {
      const key = String(row[field]); out[key] = (out[key] ?? 0) + 1; return out;
    }, {});
  return {
    facts, gaps,
    summary: {
      release_id: snapshot.release_id,
      scope: "All profile facts and declared record metadata gaps; result coverage/uncertainty fields absent without a declaration are marked unextracted, not unreported.",
      method: "automated_release_inventory",
      independent_scientific_review: false,
      profiles: snapshot.records.filter(record => record.attributes.profile).length,
      profile_fact_count: facts.length,
      profile_fact_states: count(facts, "status"),
      record_gap_count: gaps.length,
      record_gap_states: count(gaps, "status"),
      record_gap_kinds: count(gaps, "kind"),
    },
  };
}

if (process.argv[1]?.endsWith("profile-gap-audit.ts")) {
  const [input = "public/omics/catalogue.json", output = "workbench/profile-gap-audit"] = process.argv.slice(2);
  const audit = profileGapAudit(JSON.parse(fs.readFileSync(input, "utf8")));
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "profile-facts.csv"), csv(audit.facts));
  fs.writeFileSync(path.join(output, "record-gaps.csv"), csv(audit.gaps));
  fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(audit.summary, null, 2) + "\n");
  console.log(JSON.stringify(audit.summary));
}
