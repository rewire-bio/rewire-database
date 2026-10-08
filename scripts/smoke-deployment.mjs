import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { pinnedDownloads, assertProducerReceipt, fetchGithubDownload } from './github-downloads.mjs';

/** Read-only deployment checks. No credentials, submissions or mutations. */
export async function smokeDeployment(origin, { request = fetch, log = console.log, independentFrontend = false, downloads: suppliedDownloads } = {}) {
  const base = new URL(origin);
  assert.ok(['http:', 'https:'].includes(base.protocol), 'Supply an HTTP(S) deployment URL');
  async function get(path, type) {
    const url = new URL(path, base);
    assert.equal(url.origin, base.origin, 'Smoke requests must stay on the deployment origin');
    const response = await request(url, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, `${url.pathname}: HTTP ${response.status}`);
    assert.ok(response.headers.get('content-type')?.includes(type), `${url.pathname}: expected ${type}`);
    log(`PASS ${url.pathname}`);
    return response;
  }
  const html = async path => (await get(path, 'text/html')).text();
  const home = await html('/');
  assert.match(home, /id="catalogue-search"/, 'Home must render search');
  assert.match(home, /id="downloads"/, 'Home must expose downloads');
  const asset = home.match(/(?:src|href)="([^"\s]*\/_next\/static\/[^"\s]+\.js)"/);
  assert.ok(asset, 'Home must include a JavaScript bundle');
  await get(asset[1].replaceAll('&amp;', '&'), 'javascript');
  const downloads = independentFrontend ? suppliedDownloads || await pinnedDownloads() : undefined;
  const rootManifestBytes = independentFrontend ? Buffer.from(await (await get('/release-manifest.json', 'json')).arrayBuffer()) : undefined;
  const rootManifest = rootManifestBytes ? JSON.parse(rootManifestBytes.toString('utf8')) : undefined;
  const release = independentFrontend ? rootManifest?.release_id : home.match(/\/omics\/releases\/(\d{4}-\d{2}-\d{2}-[a-f0-9]{12})\//)?.[1];
  assert.match(release || '', /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/, 'Home must identify a versioned release');
  if (independentFrontend) {
    assert.ok(home.includes(release), 'Manifest and HTML release must match');
    const receipt = await (await get('/deployment.json', 'json')).json();
    assertProducerReceipt(receipt, downloads.lock, release);
    assert.equal(receipt.manifest_sha256, createHash("sha256").update(rootManifestBytes).digest("hex"), "Frontend receipt must verify exact manifest bytes");
    assert.equal(release, downloads.lock.release_id, 'Frontend manifest must match checked producer release');
    assert.ok(home.includes(downloads.urls.get(`/omics/releases/${release}/records.csv`)), 'Home must link the checked GitHub download');
  }
  for (const path of ['/models/', '/benchmarks/', '/use-cases/', '/evidence/']) {
    assert.match(await html(path), /<h1[ >]/, `${path}: missing page heading`);
  }
  const useCase = await html('/use-cases/brca1-brca2-germline-interpretation/');
  for (const id of ['question', 'evidence', 'gaps', 'sources']) {
    assert.ok(useCase.includes(`id="${id}"`), `Use case missing ${id}`);
  }
  assert.match(useCase, /<summary[ >]/, 'Use case must render evidence disclosures');
  const manifest = rootManifest || await (await get(`/omics/releases/${release}/manifest.json`, 'json')).json();
  assert.equal(manifest?.release_id, release, 'Manifest and HTML release must match');
  const downloadPath = `/omics/releases/${release}/records.csv`;
  if (independentFrontend) {
    await fetchGithubDownload(base, downloadPath, downloads, request, { head: true });
  } else {
  const download = await request(new URL(downloadPath, base), { method: 'HEAD', signal: AbortSignal.timeout(30000) });
  assert.equal(download.status, 200, 'Database CSV download must resolve');
  assert.ok(!download.headers.get('content-type')?.includes('text/html'), 'Database download returned an HTML fallback');
  if (download.headers.has('content-length')) assert.ok(Number(download.headers.get('content-length')) > 0, 'Database download is empty');
  }
  log(`PASS ${downloadPath}`);
  async function list(input) {
    const response = await get(`/api/trpc/catalogue.list?input=${encodeURIComponent(JSON.stringify({ release_id: release, limit: 5, ...input }))}`, 'json');
    const body = await response.json();
    assert.ok(!body.error, 'Catalogue API returned an error');
    const data = body.result?.data;
    assert.equal(data?.release_id, release, 'API and HTML release must match');
    assert.ok(Array.isArray(data.items), 'API must return records');
    return data;
  }
  const models = await list({ kind: 'model', q: 'AlphaGenome' });
  assert.ok(models.items.length > 0, 'Known model search returned no records');
  assert.ok(models.items.every(record => record.kind === 'model'), 'Model filter was ignored');
  assert.ok(models.items.some(record => /alphagenome/i.test(record.name)), 'Known model search returned unrelated records');
  const benchmarks = await list({ kind: 'benchmark' });
  assert.ok(benchmarks.items.length > 0, 'Benchmark filter returned no records');
  assert.ok(benchmarks.items.every(record => record.kind === 'benchmark'), 'Benchmark filter was ignored');
  for (const record of [models.items[0], benchmarks.items[0]]) {
    assert.match(await html(`/database/${record.kind}/${encodeURIComponent(record.id)}/`), /<h1[ >]/, 'Detail page missing heading');
  }
  // Result and evaluation pages render on request from prepared page documents.
  for (const kind of ['result', 'evaluation']) {
    const [record] = (await list({ kind, limit: 1 })).items;
    assert.ok(record, `No ${kind} record to check`);
    const page = await html(`/database/${kind}/${encodeURIComponent(record.id)}/`);
    assert.match(page, /<h1[ >]/, `${kind} page missing heading`);
    assert.ok(page.includes(release), `${kind} page must name its release`);
  }
  log(`Deployment smoke passed for ${base.origin} (${release}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('Usage: node scripts/smoke-deployment.mjs https://deployment.example'); process.exitCode = 1; }
  else await smokeDeployment(process.argv[2], { independentFrontend: process.argv.includes("--independent-frontend") });
}
