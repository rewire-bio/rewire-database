import { describe, expect, it } from "vitest";
import { createEvidenceIndex, evidenceCsv } from "../services/omics/src/evidence-table";
import { createCatalogueQuery, type CatalogueRecord, type CatalogueSnapshot } from "../services/omics/src/catalogue-query";
import { currentCatalogueBase, readJsonl } from "../scripts/omics/inputs";
import { enrichProfiles, type OmicsProfile } from "../lib/omics-profile";
import { enrichAssociations } from "../scripts/omics/enrich";
import { buildRelease } from "../scripts/omics/release";
import type { RecordEntry } from "../scripts/omics/schema";

const base = ["migrated", "discovery"].flatMap(name => readJsonl<RecordEntry>(`data/omics/${name}.jsonl`));
const profiles = ["model", "benchmark"].flatMap(name => readJsonl<{id: string; profile: OmicsProfile}>(`data/omics/${name}-profiles.jsonl`));
const associations = ["model", "benchmark"].flatMap(name => readJsonl(`data/omics/${name}-profile-associations.jsonl`));
const snapshot = buildRelease(enrichProfiles(enrichAssociations(currentCatalogueBase(base), associations), profiles), "2026-09-16T21:00:00Z").snapshot;
const index = createEvidenceIndex(snapshot);
const rows = index.all();
const byId = new Map(snapshot.records.map(record => [record.id, record]));

function record(id: string, kind: CatalogueRecord["kind"], attributes: Record<string, unknown> = {}): CatalogueRecord {
  return { id, kind, name: id, description: "Synthetic fixture, not scientific evidence", status: "source_checked", facets: {}, source_ids: kind === "source" ? [] : ["source"], links: [], attributes };
}
const source = record("source", "source", {url: "https://example.org/paper", version: "v1", artifact_sha256: "a".repeat(64), artifact_url: "https://example.org/paper.xml", hash_scope: "Exact downloaded XML bytes", artifact_format: "xml", retrieved_at: "2026-09-16"});
function fixture(records: CatalogueRecord[]): CatalogueSnapshot {
  return {schema_version: "1.0", release_id: "synthetic-release", released_at: "2026-09-16", coverage: {}, records: [source, ...records]};
}
function claim(id: string, value: unknown): CatalogueRecord {
  return {...record(id, "claim", {field: "attributes.answer", value, source_locator: "Table 1, exact fixture cell"}), links: [{relation: "subject", target_id: "subject"}]};
}

describe("catalogue evidence coverage and review boundaries", () => {
  it("covers every public record with unique release-pinned rows and resolvable sources", () => {
    expect(new Set(rows.map(row => row.record_id))).toEqual(new Set(snapshot.records.map(record => record.id)));
    expect(new Set(rows.map(row => row.row_id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.release_id).toBe(snapshot.release_id);
      if (row.source_id) expect(byId.get(row.source_id)?.kind).toBe("source");
    }
  });

  it("preserves all 167 printed values, including the 24 inline-reviewed results", () => {
    const historicalIds = new Set(base.filter(record => record.kind === "result").map(record => record.id));
    const results = snapshot.records.filter(record => record.kind === "result" && historicalIds.has(record.id));
    expect(results).toHaveLength(167);
    let inline = 0;
    for (const result of results) {
      const printed = index.forRecord(result.id).filter(row => row.field_path === "attributes.printed_value");
      expect(printed.length).toBeGreaterThan(0);
      for (const row of printed) {
        expect(row.value_json).toBe(JSON.stringify(result.attributes.printed_value));
        expect(row.evidence_scope).toBe("individual_claim");
        expect(row.source_locator).not.toBe("");
        expect(row.review_method).not.toBe("");
        const evaluation = byId.get(result.links.find(link => link.relation === "evaluation")!.target_id)!;
        expect(row.evidence_origin).toBe(evaluation.attributes.origin);
      }
      if (printed.every(row => !row.claim_id)) inline++;
    }
    expect(inline).toBe(24);
  });

  it("does not upgrade surrounding model, result or evaluation metadata from a checked score", () => {
    for (const result of snapshot.records.filter(record => record.kind === "result")) {
      const resultRows = index.forRecord(result.id);
      for (const path of ["attributes.numeric_value", "attributes.metric", "attributes.metric_direction", "attributes.units"]) {
        for (const row of resultRows.filter(row => row.field_path === path)) {
          expect(row.evidence_scope).toBe("record_context");
          expect(["not_individually_reviewed", "missing_or_unspecified"]).toContain(row.review_status);
        }
      }
    }
    const evalRows = index.forRecord("evaluation-b2-barcodebert-2026");
    expect(evalRows.find(row => row.field_path === "attributes.version")?.evidence_scope).toBe("record_context");
    for (const row of evalRows.filter(row => row.value_json === "null" && row.evidence_scope === "record_context")) {
      expect(row.review_status).toBe("missing_or_unspecified");
    }
  });

  it("preserves fact-level unknowns, citations and combined-locator scope", () => {
    for (const {id, profile} of profiles) {
      const recordRows = index.forRecord(id);
      profile.facts.forEach((fact, i) => {
        const facts = recordRows.filter(row => row.field_path === `attributes.profile.facts.${i}.value`);
        expect(facts.map(row => row.source_id).sort()).toEqual([...new Set(fact.source_ids)].sort());
        for (const row of facts) {
          expect(row.review_status).toBe(fact.status || "not_individually_reviewed");
          expect(row.source_locator).toBe(fact.source_locator);
          expect(row.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
          if (fact.source_ids.length > 1) expect(row.locator_scope).toBe("shared_claim_locator");
        }
      });
    }
  });

  it("labels MFASS hashes as imported manifest bytes rather than upstream repository bytes", () => {
    const mfass = rows.filter(row => row.source_id === "rewire-mfass-v2-source");
    expect(mfass.length).toBeGreaterThan(0);
    for (const row of mfass) {
      expect(row.hash_scope).toContain("Local imported data/benchmark-runs/mfass-v2.json");
      expect(row.hash_scope).toContain("not the upstream");
    }
  });

  it("retains exact extraction artifact receipts for dedicated result claims", () => {
    const result = byId.get("b2-barcodebert-2026")!;
    const review = result.attributes.review as Record<string, string>;
    const printed = index.forRecord(result.id).find(row => row.field_path === "attributes.printed_value")!;
    expect(review.artifact_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(printed.extraction_artifact_sha256).toBe(review.artifact_sha256);
    expect(printed.extraction_artifact_url).toBe(review.retrieval_url);
  });
});

describe("evidence conflicts, values and reproducibility", () => {
  it("matches explicit null claims without treating them as absent target IDs", () => {
    const table = createEvidenceIndex(fixture([record("subject", "model", {answer: null}), claim("claim-null", null)])).forRecord("subject");
    const row = table.find(row => row.field_path === "attributes.answer")!;
    expect(row.value_json).toBe("null");
    expect(row.review_status).toBe("source_checked");
  });

  it("compares JSON values semantically regardless of object-key order", () => {
    const value = [{a: 1, b: 2}];
    const table = createEvidenceIndex(fixture([record("subject", "model", {answer: value}), claim("claim-object", [{b: 2, a: 1}])])).forRecord("subject");
    expect(table.find(row => row.field_path === "attributes.answer")?.review_status).toBe("source_checked");
  });

  it("retains both competing asserted values separately from the catalogue value", () => {
    const table = createEvidenceIndex(fixture([record("subject", "model", {answer: "current"}), claim("claim-a", "current"), claim("claim-b", "different")])).forRecord("subject");
    const assertions = table.filter(row => row.field_path === "attributes.answer");
    expect(assertions).toHaveLength(2);
    expect(assertions.find(row => row.claim_id === "claim-b")?.review_status).toBe("conflicting_claim");
    expect(assertions.map(row => row.claimed_value_json).sort()).toEqual(['"current"', '"different"']);
    expect(assertions.every(row => row.value_json === '"current"')).toBe(true);
  });

  it("does not borrow extraction receipts from another cell with the same printed value", () => {
    const result = record("subject", "result", {
      printed_value: "78.5", source_locator: "Table 1, cell A",
      review: {method: "exact_cell_check", artifact_sha256: "b".repeat(64), retrieval_url: "https://example.org/table1.xml"},
    });
    const otherClaim = {...claim("other-cell", "78.5"), attributes: {
      field: "attributes.printed_value", value: "78.5", source_locator: "Table 2, cell B",
      review: {method: "separate_cell_check"},
    }};
    const row = createEvidenceIndex(fixture([result, otherClaim])).forRecord("subject").find(row => row.field_path === "attributes.printed_value")!;
    expect(row.source_locator).toBe("Table 2, cell B");
    expect(row.review_method).toBe("separate_cell_check");
    expect(row.extraction_artifact_sha256).toBe("");
    expect(row.extraction_artifact_url).toBe("");
  });

  it("keeps quoted evidence origin and source concerns visible without changing scores", () => {
    const quoted = index.forRecord("b2-eden-genomic-classification-2026").filter(row => row.field_path === "attributes.printed_value");
    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.every(row => row.evidence_origin === "paper_compilation")).toBe(true);
    const concerned = index.forRecord("lit-b4-017").filter(row => row.field_path === "attributes.printed_value");
    expect(concerned.some(row => row.source_concerns.includes("4.3"))).toBe(true);
    expect(concerned.every(row => row.value_json === JSON.stringify(byId.get("lit-b4-017")!.attributes.printed_value))).toBe(true);
  });

  it("separates source bookkeeping and catalogue administration from individual claims", () => {
    const table = createEvidenceIndex(fixture([record("subject", "model", {answer: 1})]));
    expect(table.forRecord("source").every(row => row.evidence_scope === "source_metadata" && row.review_status === "catalogued")).toBe(true);
    for (const row of table.forRecord("subject").filter(row => ["id", "kind", "status", "source_ids"].includes(row.field_path))) {
      expect(row.evidence_scope).toBe("catalogue_metadata");
      expect(row.source_id).toBe("");
    }
  });

  it("never treats an absent claim value or citation as verified null", () => {
    const subject = record("subject", "model", {answer: null});
    const absent = claim("absent", null); delete absent.attributes.value;
    const uncited = {...claim("uncited", null), source_ids: []};
    const table = createEvidenceIndex(fixture([subject, absent, uncited])).forRecord("subject").filter(row => row.field_path === "attributes.answer");
    expect(table).toHaveLength(2);
    expect(table.every(row => row.review_status === "unresolved_claim")).toBe(true);
    expect(table.find(row => row.claim_id === "absent")?.claimed_value_json).toBe("");
  });

  it("distinguishes null, zero, false and empty arrays without dropping values", () => {
    const table = createEvidenceIndex(fixture([record("subject", "model", {null_value: null, zero: 0, flag: false, empty_array: []})])).forRecord("subject");
    for (const [field, expected] of Object.entries({null_value: "null", zero: "0", flag: "false", empty_array: "[]"})) {
      expect(table.find(row => row.field_path === `attributes.${field}`)?.value_json).toBe(expected);
    }
  });

  it("exports deterministically under record ordering and preserves citation identity for identical bytes", () => {
    expect(createEvidenceIndex({...snapshot, records: [...snapshot.records].reverse()}).all()).toEqual(rows);
    const second = {...source, id: "second-source", name: "Second independent source"};
    const subject = {...record("subject", "model", {answer: 1}), source_ids: ["second-source", "source"]};
    const table = createEvidenceIndex(fixture([second, subject])).forRecord("subject").filter(row => row.field_path === "attributes.answer");
    expect(table).toHaveLength(2);
    expect(new Set(table.map(row => row.artifact_sha256)).size).toBe(1);
    expect(new Set(table.map(row => row.source_id)).size).toBe(2);
  });

  it("escapes CSV text and neutralises spreadsheet formulas without changing exact JSON values", () => {
    const table = createEvidenceIndex(fixture([record("subject", "model", {answer: '=HYPERLINK("https://example.org", "x,y")\nnext'})])).forRecord("subject").filter(row => row.field_path === "attributes.answer");
    const csv = evidenceCsv(table);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.org"", ""x,y"")\nnext"');
    expect(JSON.parse(table[0].value_json)).toBe('=HYPERLINK("https://example.org", "x,y")\nnext');
  });

  it("rejects private data and broken source references rather than exporting partial provenance", () => {
    expect(() => createEvidenceIndex(fixture([record("subject", "model", {email: "private@example.org"})]))).toThrow();
    expect(() => createEvidenceIndex(fixture([{...record("subject", "model"), source_ids: ["missing"]}])).all()).toThrow("Unresolved evidence source");
  });
});

describe("release-pinned evidence pagination", () => {
  const query = createCatalogueQuery(snapshot);
  const id = "reported-model-05103f72325fe5";
  it("retrieves every filtered row exactly once across pages", () => {
    const wanted = index.forRecord(id).filter(row => row.evidence_scope === "individual_claim");
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = query.evidence({id, scope: "individual_claim", limit: 3, cursor});
      expect(page.total).toBe(wanted.length);
      expect(page.release_id).toBe(snapshot.release_id);
      seen.push(...page.items.map(row => row.row_id));
      cursor = page.next_cursor || undefined;
    } while (cursor);
    expect(seen).toEqual(wanted.map(row => row.row_id));
    expect(new Set(seen).size).toBe(seen.length);
  });
  it("rejects cursors from other records, scopes, queries and releases", () => {
    const cursor = query.evidence({id, limit: 1}).next_cursor!;
    expect(cursor).toBeTruthy();
    expect(() => query.evidence({id: "b2-barcodebert-2026", cursor})).toThrow("Cursor does not match");
    expect(() => query.evidence({id, scope: "individual_claim", cursor})).toThrow("Cursor does not match");
    expect(() => query.evidence({id, q: "architecture", cursor})).toThrow("Cursor does not match");
    expect(() => createCatalogueQuery({...snapshot, release_id: "different-release"}).evidence({id, cursor})).toThrow("Cursor does not match");
  });
});
