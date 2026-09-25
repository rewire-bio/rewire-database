import { baselineAuditFiles } from "./baseline-coverage";
import {
  catalogueIndexPaths,
  indexRecords,
  indexMetadata,
  MODEL_PAGE_SIZE,
} from "../../lib/catalogue-index";
import { recordHref, recordRouteKinds } from "../../lib/omics";
import {
  recordIsIndexable,
  recordSearchMetadata,
} from "../../lib/catalogue-seo";
import { recordBreadcrumbs } from "../../lib/catalogue-sharing";
import { DOMAINS } from "../../lib/benchmark-catalog";
import {
  checkPageMetadata,
  checkSitemap,
  checkSocialImage,
} from "../seo/check-page-metadata";
import { utilityPageMetadataContracts } from "../seo/utility-page-metadata";
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
const origin = "https://benchmarks.rewire.it";
const sitemap = checkSitemap(fs.readFileSync("out/sitemap.xml", "utf8"));
failures.push(...sitemap.failures, ...checkSocialImage("out"));
const indexPaths = catalogueIndexPaths(records);
const expectedSitemap = new Set(
  [
    "/",
    "/runs/mfass-v2/",
    "/evidence/",
    "/audits/",
    ...indexPaths,
    ...records.filter(recordIsIndexable).map(recordHref),
  ].map((url) => origin + url),
);
for (const url of sitemap.urls)
  if (!expectedSitemap.has(url))
    failures.push(`Unexpected sitemap URL: ${url}`);
for (const url of expectedSitemap)
  if (!sitemap.urls.has(url)) failures.push(`Missing sitemap URL: ${url}`);
const robots = fs.readFileSync("out/robots.txt", "utf8");
if (
  /Disallow:\s*\//i.test(robots) ||
  !/User-Agent:\s*\*/i.test(robots) ||
  !robots.includes(`Sitemap: ${origin}/sitemap.xml`)
)
  failures.push(
    "Robots.txt must allow claim crawling and declare the canonical sitemap",
  );
function page(url: string) {
  const file = path.join("out", url, "index.html");
  if (!fs.existsSync(file)) failures.push(file);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}
for (const record of records) {
  const url = recordHref(record);
  const html = page(url);
  const metadata = recordSearchMetadata(record, records);
  const contract = {
    canonical: metadata.alternates.canonical,
    title: metadata.title,
    description: metadata.description,
    indexable: recordIsIndexable(record),
    social: true,
    breadcrumbs: recordBreadcrumbs(record),
  };
  failures.push(
    ...checkPageMetadata(
      html,
      { ...contract, path: url, inSitemap: contract.indexable },
      sitemap.urls,
    ),
  );
  for (const kind of recordRouteKinds(record).filter(
    (kind) => kind !== record.kind,
  )) {
    const aliasPath = `/database/${kind}/${record.id}/`;
    failures.push(
      ...checkPageMetadata(
        page(aliasPath),
        { ...contract, path: aliasPath, inSitemap: false },
        sitemap.urls,
      ),
    );
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
for (const url of indexPaths) {
  const html = page(url);
  const number = url === "/models/" ? 1 : Number(url.match(/page\/(\d+)/)?.[1]);
  const metadata = indexMetadata(
    url === "/benchmarks/" ? "benchmark" : "model",
    number,
  );
  failures.push(
    ...checkPageMetadata(
      html,
      {
        path: url,
        canonical: origin + url,
        title: String(metadata.title),
        description: metadata.description || "",
        indexable: true,
        inSitemap: true,
        social: true,
        breadcrumbs: [
          { name: "Database", path: "/" },
          {
            name: url === "/benchmarks/" ? "Benchmarks" : "Models",
            path: url === "/benchmarks/" ? "/benchmarks/" : "/models/",
          },
          ...(number > 1 ? [{ name: `Page ${number}`, path: url }] : []),
        ],
      },
      sitemap.urls,
    ),
  );
  const expected =
    url === "/benchmarks/"
      ? indexRecords(records, "benchmark")
      : indexRecords(records, "model").slice(
          (number - 1) * MODEL_PAGE_SIZE,
          number * MODEL_PAGE_SIZE,
        );
  for (const record of expected) {
    if (!html.includes(`href="${recordHref(record)}"`))
      failures.push(`Index missing canonical anchor ${record.id}`);
  }
}
const utilityPages = new Map<string, string>();
for (const contract of utilityPageMetadataContracts) {
  const html = page(contract.path);
  utilityPages.set(contract.path, html);
  failures.push(
    ...checkPageMetadata(html, contract, sitemap.urls),
  );
}
const home = page("/");
failures.push(
  ...checkPageMetadata(
    home,
    {
      path: "/",
      canonical: origin + "/",
      indexable: true,
      inSitemap: true,
      social: true,
      website: true,
    },
    sitemap.urls,
  ),
);
if (!home.includes('id="mfass-v1"')) failures.push("Preserved MFASS v1 anchor");
for (const url of [
  "/literature/",
  "/database/",
  ...DOMAINS.map(({ id }) => `/${id}/`),
]) {
  failures.push(
    ...checkPageMetadata(
      page(url),
      {
        path: url,
        canonical: origin + "/",
        indexable: url === "/literature/",
        inSitemap: false,
        social: false,
      },
      sitemap.urls,
    ),
  );
}
const papers = JSON.parse(
  fs.readFileSync("data/benchmark-literature/papers.json", "utf8"),
);
const sourcePaths = new Map(
  records
    .filter(
      (record) => record.kind === "source" && record.status !== "excluded",
    )
    .map((record) => [record.id, recordHref(record)]),
);
for (const paper of papers) {
  const url = `/literature/papers/${paper.id}/`;
  const destination = sourcePaths.get(paper.id);
  failures.push(
    ...checkPageMetadata(
      page(url),
      {
        path: url,
        canonical: origin + (destination || url),
        indexable: Boolean(destination),
        inSitemap: false,
        social: false,
      },
      sitemap.urls,
    ),
  );
}
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
  const file = path.join(
    "out/omics/baseline-coverage",
    catalogue.release_id,
    name,
  );
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== expected)
    failures.push(`Baseline audit export mismatch: ${name}`);
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(
  `Verified ${records.length} record pages, generated metadata and local links, ${papers.length} historical paper pages, MFASS history and release checksums.`,
);

const contributionPage = utilityPages.get("/contribute/")!;
const contributionsEnabled = verifyContributionExport(
  contributionPage,
  process.env.NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED,
);
console.log(
  `Contribution export is ${contributionsEnabled ? "enabled with email verification" : "disabled with local drafts"} and analytics-free.`,
);
