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
import { createUseCaseQuery, validateUseCaseArtifact } from "../../services/omics/src/use-cases";
import { parseUseCaseSourceDeclaration } from "./use-cases";
import { researchFiles } from "./research-release";
import { deriveResearchReadiness, getResearch } from "../../services/omics/src/research";
const catalogue = JSON.parse(
  fs.readFileSync("out/omics/catalogue.json", "utf8"),
);
const records = validateRecords(catalogue.records);
const currentManifest = JSON.parse(fs.readFileSync("out/omics/manifest.json", "utf8"));
const useCaseDeclaration = currentManifest.coverage?.use_cases;
const useCaseFile = path.join("out/omics/releases", catalogue.release_id, "use-cases.json");
if (Boolean(useCaseDeclaration) !== Boolean(currentManifest.files["use-cases.json"])) throw Error("Use-case declaration/export mismatch");
const useCaseArtifact = useCaseDeclaration ? validateUseCaseArtifact(catalogue, JSON.parse(fs.readFileSync(useCaseFile, "utf8")), useCaseDeclaration) : undefined;
const useCaseQuery = createUseCaseQuery(catalogue, useCaseArtifact, useCaseDeclaration);
const useCaseEntries = useCaseArtifact?.use_cases || [];
const failures: string[] = [];
for (const source of parseUseCaseSourceDeclaration(currentManifest.coverage?.use_case_sources || [])) {
  const archived = path.join("out/omics/releases", catalogue.release_id, source.file);
  const alias = path.join("out/omics/sources", `${source.sha256}.md`);
  if (!fs.existsSync(archived) || !fs.existsSync(alias) || fileSha256(archived) !== source.sha256 || fileSha256(alias) !== source.sha256)
    failures.push(`Missing or changed public use-case source copy: ${source.file}`);
}
const origin = "https://benchmarks.rewirebio.io";
const sitemap = checkSitemap(fs.readFileSync("out/sitemap.xml", "utf8"));
failures.push(...sitemap.failures, ...checkSocialImage("out"));
const indexPaths = catalogueIndexPaths(records);
const expectedSitemap = new Set(
  [
    "/",
    "/runs/mfass-v2/",
    "/evidence/",
    "/audits/",
    "/use-cases/",
    "/investigations/",
    ...getResearch(catalogue).investigations.map((report) => `/investigations/${report.id}/`),
    ...useCaseEntries.map((entry) => `/use-cases/${entry.slug}/`),
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
    if (!href.startsWith("/database/") && !href.startsWith("/omics/") && !href.startsWith("/use-cases/")) continue;
    const url = new URL(href, "https://benchmarks.rewirebio.io");
    let file = path.join("out", decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) failures.push(href);
  }
}
// Use-case discovery and decision evidence must be exported, not client-only.
function escaped(value: string) {
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
  return value.replace(/[&<>"']/g, (character) => escapes[character]);
}
const useCaseIndex = page("/use-cases/");
failures.push(...checkPageMetadata(useCaseIndex, {
  path: "/use-cases/", canonical: `${origin}/use-cases/`, title: "Biological research use cases | rewire.it",
  description: "Research and clinical research questions guide evidence gathering. Explore collection plans, reviewed model comparisons and the limits of their evidence.",
  indexable: true, inSitemap: true, social: true,
  breadcrumbs: [{ name: "Database", path: "/" }, { name: "Use cases", path: "/use-cases/" }],
}, sitemap.urls));
for (const entry of useCaseEntries) {
  const url = `/use-cases/${entry.slug}/`;
  const html = page(url);
  failures.push(...checkPageMetadata(html, {
    path: url, canonical: origin + url, title: `${entry.title} | rewire.it`, description: entry.question,
    indexable: true, inSitemap: true, social: true,
    breadcrumbs: [{ name: "Database", path: "/" }, { name: "Use cases", path: "/use-cases/" }, { name: entry.title, path: url }],
  }, sitemap.urls));
  for (const text of [entry.question, entry.decision, entry.setting, entry.clinical_scope, ...entry.inputs, ...entry.evidence_gaps])
    if (!html.includes(escaped(text))) failures.push(`Use-case HTML omits scope or evidence: ${entry.slug}: ${text}`);
  if (entry.collection_plan) {
    const plan = entry.collection_plan;
    for (const text of [plan.comparison_question, ...plan.baselines, ...plan.outcomes, ...plan.validation_requirements, plan.next_step,
      plan.status === "planned" ? "Collection planned" : "Collecting evidence"])
      if (!html.includes(escaped(text))) failures.push(`Use-case HTML omits its collection plan: ${entry.slug}: ${text}`);
  }
  if (!html.includes(catalogue.release_id) || !html.includes(useCaseArtifact!.input_sha256)) failures.push(`Use-case provenance missing: ${entry.slug}`);
  for (const mapping of useCaseQuery.get({ slug: entry.slug })!.mappings) {
    if (!html.includes(`id="mapping-${mapping.id}"`)) failures.push(`Use-case mapping missing: ${mapping.id}`);
    for (const evaluation of mapping.evaluations) for (const row of evaluation.results)
      if (!html.includes(recordHref(row.result))) failures.push(`Use-case result source missing: ${row.result.id}`);
  }
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (!/^\/(?:database|omics|use-cases)\//.test(href)) continue;
    const target = new URL(href, origin);
    const file = path.join("out", decodeURIComponent(target.pathname), target.pathname.endsWith("/") ? "index.html" : "");
    if (!fs.existsSync(file)) failures.push(`Use-case link missing: ${href}`);
  }
}
for (const entry of useCaseQuery.list({ limit: 10 }).items)
  if (!useCaseIndex.includes(`href="/use-cases/${entry.slug}/"`)) failures.push(`Use-case index missing canonical discovery anchor: ${entry.slug}`);
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
if (!home.includes('href="/use-cases/"')) failures.push("Use-case homepage navigation missing");
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
page("/investigations/");
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
const evidenceIndex = createEvidenceIndex(catalogue, { cache: false });
const evidenceRoot = path.join("out/omics/releases", catalogue.release_id);
for (const [name, expected] of Object.entries(researchFiles(catalogue))) {
  const exported = path.join(evidenceRoot, name);
  if (!fs.existsSync(exported) || fs.readFileSync(exported, "utf8") !== expected)
    failures.push(`Research sidecar differs from catalogue: ${name}`);
}
const research = getResearch(catalogue);
for (const report of research.investigations) {
  const html = page(`/investigations/${report.id}/`);
  if (!html.includes(report.id)) failures.push(`Missing investigation evidence: ${report.id}`);
}
for (const item of deriveResearchReadiness(catalogue).filter(item => item.manifest_ids.length)) {
  const record = records.find(record => record.id === item.record_id)!;
  if (!page(recordHref(record)).includes('id="research-readiness"'))
    failures.push(`Missing research readiness panel: ${item.record_id}`);
}
if (fs.readFileSync("out/sitemap.xml", "utf8").includes("_no-reviewed-reports"))
  failures.push("Empty investigation sentinel entered sitemap");
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
