import { validateSnapshot } from "../services/omics/src/validation";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  currentCatalogueBase,
  readJsonl,
  reviewedResults,
} from "../scripts/omics/inputs";
import { buildRelease } from "../scripts/omics/release";
import { type RecordEntry } from "../scripts/omics/schema";
import { createCatalogueQuery } from "../services/omics/src/catalogue-query";
import { createEvidenceIndex } from "../services/omics/src/evidence-table";

const batch = reviewedResults();
const receipt = JSON.parse(
  fs.readFileSync(
    "data/omics/reviews/2026-09-17-alphagenome-results.json",
    "utf8",
  ),
);
const tables = JSON.parse(
  fs.readFileSync("data/omics/reviews/alphagenome-2026/tables.json", "utf8"),
);
const base = ["migrated", "discovery"].flatMap((name) =>
  readJsonl<RecordEntry>(`data/omics/${name}.jsonl`),
);
const release = buildRelease(
  currentCatalogueBase(base),
  "2026-09-17T00:00:00Z",
).snapshot;
const query = createCatalogueQuery(release);
const evidence = createEvidenceIndex(release);
const byId = new Map(batch.map((record) => [record.id, record]));
const family = "catalog-model-alphagenome";
const occurrence = (table: number, row: number, role = "alphagenome") =>
  receipt.occurrences.find(
    (item: any) =>
      item.source_row_id === `alphagenome-nature2026-table${table}-row${row}` &&
      item.role === role,
  );

function allResults(id: string) {
  const rows: ReturnType<typeof query.results>["items"] = [];
  let cursor: string | undefined;
  do {
    const page = query.results({ id, limit: 100, cursor });
    rows.push(...page.items);
    cursor = page.next_cursor || undefined;
  } while (cursor);
  return rows;
}

describe("complete AlphaGenome primary-table batch", () => {
  it("imports through the existing service contract without extending the schema", () => {
    expect(() => validateSnapshot(release)).not.toThrow();
    const independent = JSON.parse(
      fs.readFileSync(
        "data/omics/reviews/2026-09-17-alphagenome-independent-review.json",
        "utf8",
      ),
    );
    expect(independent.input_sha256).toBe(receipt.records_sha256);
    expect(independent.errors).toEqual([]);
  });
  it("receipts every source score cell without losing comparisons or fabricating independent duplicates", () => {
    expect(tables.rows).toHaveLength(77);
    expect(receipt.occurrences).toHaveLength(154);
    expect(receipt.unique_results).toBe(136);
    expect(receipt.published_results).toBe(130);
    expect(receipt.quarantined_results).toBe(6);
    expect(
      createHash("sha256")
        .update(fs.readFileSync("data/omics/reviewed/alphagenome-2026.jsonl"))
        .digest("hex"),
    ).toBe(receipt.records_sha256);
    for (const row of tables.rows)
      for (const role of ["alphagenome", "comparator"]) {
        const item = occurrence(row.table, row.sheet_row, role);
        const result = byId.get(item.result_id)!;
        expect(result.attributes.numeric_value).toBe(
          row[role].score.raw_xml_value,
        );
        expect(result.attributes.source_cells).toContain(
          row[role].evidence_locator,
        );
        expect(result.attributes.workbook_number_format).toBe(
          row[role].score.number_format,
        );
        expect(item.disposition === "quarantined").toBe(
          result.status === "disputed",
        );
        if (row[role].score.number_format !== "General")
          expect(result.attributes.printed_value).toBe(
            row[role].score.printed_value,
          );
        else
          expect(result.attributes.printed_value_basis).toContain(
            "Canonical stored-number transcription",
          );
      }
    expect(occurrence(3, 2).result_id).toBe(occurrence(3, 3).result_id);
    expect(occurrence(4, 10).result_id).not.toBe(occurrence(4, 11).result_id);
    expect(occurrence(3, 13).result_id).not.toBe(occurrence(3, 15).result_id);
  });

  it("makes every published row reachable from exact models, protocols and datasets through the API", () => {
    for (const result of batch.filter(
      (r) => r.kind === "result" && r.status === "source_checked",
    )) {
      const row = query.results({ id: result.id }).items[0];
      expect(row.origin).toBe("author_reported");
      expect(row.models).toHaveLength(1);
      expect(row.benchmarks).toHaveLength(1);
      expect(row.datasets).toHaveLength(1);
      for (const target of [...row.models, ...row.benchmarks, ...row.datasets])
        expect(
          allResults(target.id).some((r) => r.result.id === result.id),
        ).toBe(true);
      expect(
        evidence
          .forRecord(result.id)
          .filter((r) => r.field_path === "attributes.printed_value")
          .every(
            (r) =>
              r.evidence_origin === "author_reported" &&
              r.artifact_sha256 === receipt.source_sha256 &&
              r.review_status === "source_checked",
          ),
      ).toBe(true);
    }
  });

  it("puts source-checked base configurations on the family page but keeps four supervised pipelines separate", () => {
    const familyRows = allResults(family);
    expect(familyRows.length).toBeGreaterThan(40);
    for (const sheetRow of [7, 12, 14, 18]) {
      const resultId = occurrence(4, sheetRow).result_id;
      const row = query.results({ id: resultId }).items[0];
      expect(row.models[0].links).toContainEqual({
        relation: "uses_model",
        target_id: family,
      });
      expect(familyRows.some((r) => r.result.id === resultId)).toBe(false);
    }
    for (const sheetRow of [2, 8, 9, 10, 11, 13, 17, 19, 38])
      expect(
        familyRows.some(
          (r) => r.result.id === occurrence(4, sheetRow).result_id,
        ),
      ).toBe(true);
    expect(
      new Set(familyRows.flatMap((r) => r.models.map((m) => m.id))).size,
    ).toBeGreaterThan(5);
  });

  it("quarantines unresolved source differences and preserves MFASS protocol distinctions, metric directions and unknowns", () => {
    for (const [table, row] of [
      [3, 21],
      [4, 15],
      [4, 16],
    ])
      for (const role of ["alphagenome", "comparator"])
        expect(
          query.get({ id: occurrence(table, row, role).result_id }),
        ).toBeNull();
    for (const sheetRow of [17, 24, 30])
      expect(
        byId.get(occurrence(3, sheetRow).result_id)!.attributes
          .metric_direction,
      ).toBe("lower");
    const mfass = query.results({ id: occurrence(4, 8).result_id }).items[0];
    expect(mfass.result.attributes.printed_value).toBe("0.51");
    expect(Number(mfass.result.attributes.numeric_value)).toBeCloseTo(
      0.512,
      12,
    );
    expect(mfass.benchmarks[0].id).toBe("alphagenome-2026-t4-protocol-7");
    expect(mfass.result.attributes.scored_count).toBeNull();
    expect(mfass.result.attributes.uncertainty).toBeNull();
    expect(
      query.compare({
        ids: [mfass.result.id, occurrence(4, 8, "comparator").result_id],
      }).compatible,
    ).toBe(false);
  });

  it("leaves every pre-existing numerical result intact", () => {
    for (const record of base.filter(
      (r) =>
        r.kind === "result" &&
        ["source_checked", "reproduced", "superseded"].includes(r.status),
    )) {
      const current = query.get({ id: record.id });
      if (current) expect(current.record).toEqual(record);
    }
  });
});
