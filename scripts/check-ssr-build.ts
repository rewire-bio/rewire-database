import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { CatalogueSnapshot } from "../shared/omics/catalogue-query";
import { buildUseCases } from "../lib/use-cases-build";
import { getLiterature } from "../lib/benchmark-literature";
import { DOMAINS } from "../lib/benchmark-catalog";
import { recordHref, recordRouteKinds, type OmicsRecord } from "../lib/omics";
import { recordIsIndexable, recordSearchMetadata } from "../lib/catalogue-seo";
import { recordBreadcrumbs } from "../lib/catalogue-sharing";
import { catalogueIndexPaths } from "../lib/catalogue-index";
import { recordPageMetadata } from "../lib/record-page";
import { localRecordPage } from "../lib/record-page-local";
import { getResearch } from "../shared/omics/research";
import { downloadLocations, downloadUrls } from "./download-locations.mjs";
import { checkPageMetadata, checkSitemap, checkSocialImage } from "./seo/check-page-metadata";
import { utilityPageMetadataContracts } from "./seo/utility-page-metadata";
import { verifyContributionExport } from "./omics/contribution-export";
import { checkReleaseData } from "./check-release-data";
import { cacheableRequest, storableResponse } from "../cloudflare/page-cache.mjs";

/**
 * Production check of the assembled frontend, run the way Cloud Run runs it:
 * the container entrypoint reading the prepared release file. Expected
 * metadata comes from the release's catalogue.json, independently of the
 * prepared file the server reads. By default it renders a bounded representative sample: one page
 * per kind and alias segment, index, utility, private, download, failure and
 * SEO cases, plus the release data checks. --full renders every record page
 * as an optional audit; it is not part of publication.
 */
const full = process.argv.includes("--full");
// scripts/build-web.mjs OUTPUT and ENTRYPOINT (that module has top-level await).
const OUTPUT = "build/web", ENTRYPOINT = "runtime/scripts/server-entry.mjs";
const PORT = 8793;
const ORIGIN = "https://benchmarks.rewirebio.io";
const origin = `http://127.0.0.1:${PORT}`;
const FRONTEND = "0".repeat(40);
const get = (pathname: string, headers: Record<string, string> = {}) =>
  fetch(new URL(pathname, origin), { headers, redirect: "manual", signal: AbortSignal.timeout(60_000) });

async function main() {
  console.log(JSON.stringify({ release_data: checkReleaseData() }));
  const catalogue = JSON.parse(fs.readFileSync("public/omics/catalogue.json", "utf8")) as CatalogueSnapshot;
  const live = catalogue.records.filter((record) => record.status !== "excluded");
  const firstOf = (kind: string) => live.find((record) => record.kind === kind)!;
  const server = spawn(process.execPath, [path.join(OUTPUT, ENTRYPOINT)], {
    stdio: ["ignore", "inherit", "inherit"], detached: process.platform !== "win32",
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), HOSTNAME: "127.0.0.1", REWIRE_DATA_ROOT: "",
      REWIRE_FRONTEND_VERSION: FRONTEND },
  });
  try {
    const deadline = Date.now() + 120_000;
    for (;;) {
      if (server.exitCode !== null) throw new Error(`Frontend server exited (${server.exitCode})`);
      try { if ((await get("/release-manifest.json")).status === 200) break; } catch { /* starting */ }
      if (Date.now() > deadline) throw new Error("Frontend server did not start");
      await sleep(250);
    }
    await checkContracts(catalogue.release_id, firstOf);
    const sitemap = checkSitemap(await (await get("/sitemap.xml")).text());
    assert.deepEqual(sitemap.failures, []);
    checkSitemapInventory(catalogue, sitemap.urls);
    assert.deepEqual(checkSocialImage("public"), []);
    const failures: string[] = [];
    let rendered = 0;
    const html = async (pathname: string) => {
      const response = await get(pathname);
      assert.equal(response.status, 200, `${pathname}: HTTP ${response.status}`);
      rendered++;
      return response.text();
    };
    // Record pages: every kind and every alias segment, with full SEO contracts.
    const byId = new Map(live.map((record) => [record.id, record]));
    const samples = new Map<string, OmicsRecord>();
    for (const record of live)
      for (const kind of recordRouteKinds(record)) {
        const key = `${kind}:${kind === record.kind ? "canonical" : "alias"}`;
        if (full || !samples.has(key)) samples.set(full ? `${kind}:${record.id}` : key, record);
      }
    const queue = [...samples.entries()];
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [key, record] = item;
        const kind = key.split(":")[0];
        const pathname = kind === record.kind ? recordHref(record) : `/database/${kind}/${record.id}/`;
        const metadata = kind === "result" || kind === "evaluation"
          ? recordPageMetadata(localRecordPage(kind, record.id)!)
          : recordSearchMetadata(byId.get(record.id)!, live);
        const page = await html(pathname);
        failures.push(...checkPageMetadata(page, {
          path: pathname, canonical: String(metadata.alternates!.canonical), title: String(metadata.title), description: String(metadata.description),
          indexable: recordIsIndexable(record), inSitemap: kind === record.kind && recordIsIndexable(record), social: true, breadcrumbs: recordBreadcrumbs(record),
        }, sitemap.urls));
        if (!page.includes('id="evidence"')) failures.push(`Missing evidence table: ${pathname}`);
      }
    }));
    // Index, curated and utility pages.
    for (const contract of utilityPageMetadataContracts) failures.push(...checkPageMetadata(await html(contract.path), contract, sitemap.urls));
    const home = await html("/");
    failures.push(...checkPageMetadata(home, { path: "/", canonical: `${ORIGIN}/`, indexable: true, inSitemap: true, social: true, website: true }, sitemap.urls));
    assert.ok(home.includes('id="mfass-v1"') && home.includes('href="/use-cases/"'), "Home navigation");
    const useCase = buildUseCases().entries[0];
    for (const pathname of ["/models/", "/models/page/2/", "/benchmarks/", "/evidence/", "/audits/", "/coverage/", "/use-cases/",
      "/investigations/", "/literature/", "/runs/mfass-v2/", "/updates/", `/${DOMAINS[0].id}/`,
      ...(useCase ? [`/use-cases/${useCase.slug}/`] : []), `/literature/papers/${getLiterature().papers[0].id}/`,
      ...getResearch(catalogue).investigations.slice(0, 1).map((report) => `/investigations/${report.id}/`)])
      assert.match(await html(pathname), /<link rel="canonical" href="https:\/\/benchmarks\.rewirebio\.io\//, pathname);
    assert.match(await (await get("/updates/feed.xml")).text(), /<feed/);
    verifyContributionExport(await html("/contribute/"), process.env.NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED);
    assert.deepEqual(failures, [], "Rendered pages must meet their search and evidence contracts");
    console.log(`SSR checks passed: ${rendered} pages rendered (${full ? "full corpus" : "representative sample"}).`);
  } finally {
    try { process.kill(-server.pid!, "SIGTERM"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
}

/** Identity, cache opt-in, failure semantics, downloads, receipts and private routes. */
async function checkContracts(release: string, firstOf: (kind: string) => OmicsRecord) {
  const home = await get("/");
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("x-rewire-frontend"), FRONTEND);
  assert.equal(home.headers.get("x-rewire-data-release"), release);
  assert.equal(home.headers.get("x-rewire-edge-cache"), "public");
  const chunk = (await home.text()).match(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+\.js)"/);
  assert.ok(chunk, "Home must reference a JavaScript chunk");
  const asset = await get(chunk[1].replaceAll("&amp;", "&"));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type") || "", /javascript/);
  assert.equal(asset.headers.get("x-rewire-data-release"), release);
  assert.equal((await get("/", { cookie: "a=1" })).headers.get("x-rewire-edge-cache"), null, "Cookie requests are never cache-eligible");
  for (const kind of ["result", "evaluation"] as const) {
    const pathname = `/database/${kind}/${firstOf(kind).id}/`;
    const page = await get(pathname);
    assert.equal(page.status, 200, pathname);
    assert.ok((await page.text()).includes(release), `${pathname}: release identity`);
    // Next removes RSC headers before middleware, so the origin cannot tell these
    // apart. The Worker refuses them by request headers and by this content type.
    const rsc = await get(pathname, { RSC: "1" });
    assert.match(rsc.headers.get("content-type") || "", /text\/x-component/);
    assert.equal(storableResponse(rsc, { frontend: FRONTEND, release }), false, "RSC payloads are never stored at the edge");
    assert.equal(cacheableRequest(new Request(`https://benchmarks.rewirebio.io${pathname}`, { headers: { RSC: "1" } })), false);
  }
  assert.equal((await get("/database/result/no-such-record-anywhere/")).status, 404);
  assert.equal((await get(`/database/evaluation/${firstOf("result").id}/`)).status, 404, "Wrong kind is a 404");
  assert.equal((await get("/database/model/no-such-record-anywhere/")).status, 404);
  const urls = downloadUrls(downloadLocations(JSON.parse(fs.readFileSync("benchmark-data.lock.json", "utf8")),
    fs.readFileSync("workbench/benchmark-data/website/manifest.json")));
  for (const download of [`/omics/releases/${release}/records.csv`, "/benchmark-literature/results.csv"]) {
    const redirect = await get(download);
    assert.equal(redirect.status, 307, download);
    assert.equal(redirect.headers.get("location"), urls.get(download));
  }
  assert.equal((await get("/omics/releases/invented/records.csv")).status, 404);
  assert.deepEqual(Buffer.from(await (await get("/release-manifest.json")).arrayBuffer()), fs.readFileSync("public/omics/manifest.json"));
  assert.equal((await get("/deployment.json")).status, 404, "Unpublished builds carry no receipt");
  const contribute = await get("/contribute/");
  assert.match(contribute.headers.get("cache-control") || "", /no-store/);
  assert.equal(contribute.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(contribute.headers.get("x-rewire-edge-cache"), null);
  const analytics = await get("/_analytics/");
  assert.equal(analytics.status, 200);
  assert.match(analytics.headers.get("content-security-policy") || "", /frame-ancestors/);
  assert.match(await analytics.text(), /noindex,nofollow/);
}

/** The sitemap lists exactly the indexable canonical pages of the pinned release. */
function checkSitemapInventory(catalogue: CatalogueSnapshot, urls: Set<string>) {
  const expected = new Set([
    "/", "/runs/mfass-v2/", "/evidence/", "/audits/", "/coverage/", "/use-cases/", "/investigations/",
    ...getResearch(catalogue).investigations.map((report) => `/investigations/${report.id}/`),
    ...(catalogue.coverage.use_cases ? buildUseCases().entries.map((entry) => `/use-cases/${entry.slug}/`) : []),
    ...catalogueIndexPaths(catalogue.records),
    ...catalogue.records.filter(recordIsIndexable).map(recordHref),
  ].map((pathname) => ORIGIN + pathname));
  assert.deepEqual([...urls].filter((url) => !expected.has(url)), [], "Unexpected sitemap URLs");
  assert.deepEqual([...expected].filter((url) => !urls.has(url)), [], "Missing sitemap URLs");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
