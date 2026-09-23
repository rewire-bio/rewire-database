import { baselineAuditFiles } from "./baseline-coverage";
import { catalogueIndexPaths, indexRecords, MODEL_PAGE_SIZE } from "../../lib/catalogue-index";
import { recordHref, recordRouteKinds } from "../../lib/omics";
import {
  createEvidenceIndex,
  evidenceCsvLines,
  evidenceJsonlLines,
} from "../../services/omics/src/evidence-table";
import fs from "node:fs";
import path from "node:path";
import { fileSha256, chunksSha256 } from "./stream-files";
import { validateRecords } from "./schema";
import { verifyContributionExport } from "./contribution-export";
const catalogue = JSON.parse(
  fs.readFileSync("out/omics/catalogue.json", "utf8"),
);
const records = validateRecords(catalogue.records);
const failures: string[] = [];
function page(url: string) {
  const file = path.join("out", url, "index.html");
  if (!fs.existsSync(file)) failures.push(file);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
for (const record of records) {
  const html = page(recordHref(record));
  for (const kind of recordRouteKinds(record)) {
    const alias = page(`/database/${kind}/${record.id}/`);
    if (!alias.includes(`https://benchmarks.rewire.it${recordHref(record)}`))
      failures.push(`Missing canonical alias ${kind}/${record.id}`);
  }
  if (!html.includes('id="evidence"'))
    failures.push(`Missing evidence table: ${record.id}`);
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith("/database/") && !href.startsWith("/omics/")) continue;
    const url = new URL(href, "https://benchmarks.rewire.it");
    let file = path.join("out", decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) failures.push(href);
  }
}
// Index discovery must exist in initial HTML, not only after hydration.
const sitemapHtml = fs.readFileSync("out/sitemap.xml", "utf8");
for (const url of catalogueIndexPaths(records)) {
  const html = page(url);
  if (!html.includes(`rel="canonical" href="https://benchmarks.rewire.it${url}"`)) failures.push(`Index canonical ${url}`);
  if (!sitemapHtml.includes(`https://benchmarks.rewire.it${url}</loc>`)) failures.push(`Index sitemap ${url}`);
  const number = url === "/models/" ? 1 : Number(url.match(/page\/(\d+)/)?.[1]);
  const expected = url === "/benchmarks/" ? indexRecords(records, "benchmark") : indexRecords(records, "model").slice((number - 1) * MODEL_PAGE_SIZE, number * MODEL_PAGE_SIZE);
  for (const record of expected) {
    if (!html.includes(`href="${recordHref(record)}"`)) failures.push(`Index missing canonical anchor ${record.id}`);
  }
}
for (const url of [
  "/evidence/",
  "/literature/",
  "/runs/mfass-v1/",
  "/runs/mfass-v2/",
  "/contribute/",
])
  page(url);
if (!page("/").includes('id="mfass-v1"'))
  failures.push("Preserved MFASS v1 anchor");
const papers = JSON.parse(
  fs.readFileSync("data/benchmark-literature/papers.json", "utf8"),
);
for (const paper of papers) page(`/literature/papers/${paper.id}/`);
const currentManifest = JSON.parse(
  fs.readFileSync("out/omics/manifest.json", "utf8"),
);
const evidenceIndex = createEvidenceIndex(catalogue, { cache: false });
const evidenceRoot = path.join("out/omics/releases", catalogue.release_id);
if (
  fileSha256(path.join(evidenceRoot, "evidence.jsonl")) !==
    chunksSha256(evidenceJsonlLines(evidenceIndex.iterate())) ||
  fileSha256(path.join(evidenceRoot, "evidence.csv")) !==
    chunksSha256(evidenceCsvLines(evidenceIndex.iterate()))
)
  failures.push("Evidence exports do not match their release records");
const archiveRoot = "out/omics/releases";
const archivedIds = fs.readdirSync(archiveRoot);
if (!archivedIds.includes(currentManifest.release_id))
  failures.push("Missing current release archive");
for (const receipt of fs
  .readdirSync("data/omics/releases")
  .filter((name) => name.endsWith(".json"))) {
  const id = receipt.slice(0, -5);
  const published = path.join(archiveRoot, id, "manifest.json");
  if (
    !fs.existsSync(published) ||
    !fs
      .readFileSync(published)
      .equals(fs.readFileSync(path.join("data/omics/releases", receipt)))
  )
    failures.push(`Historical manifest ${id}`);
}
for (const id of archivedIds) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(archiveRoot, id, "manifest.json"), "utf8"),
  );
  for (const [file, digest] of Object.entries(manifest.files)) {
    if (fileSha256(path.join(archiveRoot, id, file)) !== digest)
      failures.push(`Checksum ${id}/${file}`);
  }
}
const baselineExport = baselineAuditFiles(
  fs.readFileSync("out/omics/catalogue.json"),
  "published_release",
);
for (const [name, expected] of Object.entries(baselineExport.files)) {
  const file = path.join("out/omics/baseline-coverage", catalogue.release_id, name);
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== expected)
    failures.push(`Baseline audit export mismatch: ${name}`);
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(
  `Verified ${records.length} record pages and their local links, ${papers.length} historical paper pages, MFASS history and release checksums.`,
);

const contributionPage = page("/contribute/");
const contributionsEnabled = verifyContributionExport(
  contributionPage,
  process.env.NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED,
);
console.log(`Contribution export is ${contributionsEnabled ? "enabled with email verification" : "disabled with local drafts"} and analytics-free.`);
