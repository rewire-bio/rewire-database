/** Recheck migrated table cells against primary Europe PMC full-text XML.
 * Conservative: ambiguous headers/cells are left in the review queue, never guessed.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { parseCsv } from "../../lib/benchmark-literature";
const root = process.cwd();
const cache = path.join(root, "workbench/omics-primary-sources");
fs.mkdirSync(cache, { recursive: true });
const papers = JSON.parse(
  fs.readFileSync("data/benchmark-literature/papers.json", "utf8"),
);
const csv = parseCsv(
  fs.readFileSync("data/benchmark-literature/results.csv", "utf8"),
);
const keys = csv.shift()!;
const rows = csv.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: false,
  parseTagValue: false,
});
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) return v.map(text).join(" ");
  return Object.entries(v)
    .filter(([k]) => !k.startsWith("@"))
    .map(([, x]) => text(x))
    .join(" ");
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function find(v: unknown, key: string): unknown[] {
  if (!v || typeof v !== "object") return [];
  if (Array.isArray(v)) return v.flatMap((x) => find(x, key));
  const rec = v as Record<string, unknown>;
  return [
    ...(key in rec ? (Array.isArray(rec[key]) ? rec[key] : [rec[key]]) : []),
    ...Object.entries(rec)
      .filter(([k]) => k !== key)
      .flatMap(([, x]) => find(x, key)),
  ];
}
const norm = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const numberMatch = (s: string, n: string) =>
  (s.match(/[-+−]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) || []).some(
    (x) => Number(x.replace("−", "-")) === Number(n),
  );
function grid(table: unknown): string[][] {
  return find(table, "tr")
    .map((tr) =>
      [...find(tr, "th"), ...find(tr, "td")]
        .map(text)
        .map((x) => x.replace(/\s+/g, " ").trim()),
    )
    .filter((r) => r.length);
}
type Receipt = {
  id: string;
  paper_id: string;
  status: "source_checked" | "needs_review";
  method: string;
  reviewer: string;
  reviewed_at: string;
  source_url: string;
  source_locator: string;
  printed_value: string;
  notes: string;
  retrieval_url?: string;
  artifact_sha256?: string;
  evidence?: string;
  table_rows?: string[][];
};
const receipts: Receipt[] = [];
let cursor = 0;
async function worker() {
  while (cursor < papers.length) {
    const p = papers[cursor++];
    const pmc = p.source_url.match(/PMC\d+/)?.[0];
    const related = rows.filter((r) => r.paper_id === p.id);
    const retrieved = new Date().toISOString();
    try {
      if (!pmc) throw new Error("No PMC primary XML identifier");
      const file = path.join(cache, pmc + ".xml");
      let xml: string;
      if (fs.existsSync(file)) xml = fs.readFileSync(file, "utf8");
      else {
        const r = await fetch(
          `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmc}/fullTextXML`,
          { signal: AbortSignal.timeout(45000) },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        xml = await r.text();
        if (!xml.includes("<article"))
          throw new Error("Not primary article XML");
        fs.writeFileSync(file, xml);
      }
      const hash = crypto.createHash("sha256").update(xml).digest("hex");
      const parsed = parser.parse(xml);
      const tables = find(parsed, "table-wrap");
      for (const row of related) {
        const tn = row.source_locator.match(/^Table\s+([\w.]+)/i)?.[1];
        const table = tables.find(
          (t) => norm(text(isRecord(t) ? t.label : undefined)) ===
            norm("Table " + tn),
        );
        const cells = table ? grid(table) : [];
        const rowLabel = row.source_locator.match(/,\s*(.+?)\s+row\s*,/i)?.[1];
        const colLabel = row.source_locator
          .match(/,\s*(.+?)\s+column\s*$/i)?.[1]
          ?.split(/,\s*/)
          .pop();
        let matched: string[] | null = null;
        let evidence = "";
        if (rowLabel && colLabel) {
          const rr = cells.filter((r) => norm(r[0] || "") === norm(rowLabel));
          const headers = cells.slice(0, 5);
          for (const r of rr) {
            for (const h of headers) {
              const cols = h
                .map((v, i) => (norm(v) === norm(colLabel) ? i : -1))
                .filter((i) => i >= 0);
              if (
                cols.length === 1 &&
                r.length === h.length &&
                numberMatch(r[cols[0]], row.value)
              ) {
                matched = r;
                evidence = `${row.source_locator}; cell: ${r[cols[0]]}`;
              }
            }
          }
        }
        receipts.push({
          id: row.id,
          paper_id: p.id,
          status: matched ? "source_checked" : "needs_review",
          method: "primary_xml_exact_label_cell_check",
          reviewer: "rewire deterministic table checker v1",
          reviewed_at: retrieved,
          source_url: p.source_url,
          retrieval_url: `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmc}/fullTextXML`,
          artifact_sha256: hash,
          source_locator: row.source_locator,
          printed_value: row.value,
          evidence,
          table_rows: cells,
          notes: matched
            ? "Exact row/header labels and numeric cell matched. Check verifies transcription, not experimental correctness."
            : "Table/row/column was ambiguous or did not match. Manual review required; no verification inferred.",
        });
      }
    } catch (e) {
      for (const row of related)
        receipts.push({
          id: row.id,
          paper_id: p.id,
          status: "needs_review",
          method: "primary_xml_exact_label_cell_check",
          reviewer: "rewire deterministic table checker v1",
          reviewed_at: retrieved,
          source_url: p.source_url,
          source_locator: row.source_locator,
          printed_value: row.value,
          notes: String(e),
        });
    }
    console.log(p.id);
  }
}
async function main() {
  await Promise.all(Array.from({ length: 5 }, worker));
  receipts.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(
    "data/omics/legacy-review.jsonl",
    receipts.map((x) => JSON.stringify(x)).join("\n") + "\n",
  );
  console.log(
    JSON.stringify({
      checked: receipts.filter((x) => x.status === "source_checked").length,
      needs_review: receipts.filter((x) => x.status === "needs_review").length,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
