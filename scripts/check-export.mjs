import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { historicalExportPaths } from './omics/export-scope.mjs';
const read = (file) => fs.readFileSync(file, 'utf8');
const currentOnly = process.argv.includes('--current-only');
const currentRelease = JSON.parse(read('out/omics/manifest.json')).release_id;
const historicalPaths = currentOnly ? historicalExportPaths(currentRelease) : new Set();
// A PR smoke export (npm run build:smoke) only renders one fixed use case;
// scripts/omics/write-smoke-manifest.ts both writes and self-validates this
// file, so its mere presence is the authoritative "this is a sample, not the
// full catalogue" signal here too.
const smoke = process.argv.includes('--smoke')
  ? JSON.parse(read('out/omics/smoke-manifest.json'))
  : null;
if (process.argv.includes('--smoke') && !smoke.smoke) throw new Error('out/omics/smoke-manifest.json is missing its smoke marker');
assert.ok(read('out/index.html').includes('id="mfass-v1"'), 'Historical MFASS anchor missing');
assert.ok(read('out/index.html').includes('https://benchmarks.rewirebio.io/'), 'Database canonical missing');
assert.ok(fs.existsSync('out/runs/mfass-v2/index.html'));
assert.ok(fs.existsSync('out/404.html'));
assert.ok(fs.existsSync('out/_analytics/index.html'), 'Consented analytics frame missing');
assert.ok(fs.existsSync('out/_analytics/frame.js'), 'Consented analytics implementation missing');
assert.match(read('out/_analytics/index.html'), /noindex,nofollow/);
assert.equal(/googletagmanager|google-analytics|<iframe/i.test(read('out/contribute/index.html')), false, 'Private contribution export contains analytics');
if (process.env.NEXT_PUBLIC_GA_ID) {
  const chunks = fs.readdirSync('out/_next/static/chunks/app', { recursive: true }).filter(file => String(file).endsWith('.js'));
  assert.ok(chunks.some(file => read(path.join('out/_next/static/chunks/app', String(file))).includes(process.env.NEXT_PUBLIC_GA_ID)), 'GA measurement ID missing from client build');
}
for (const paper of JSON.parse(read('data/benchmark-literature/papers.json'))) {
  assert.ok(fs.existsSync(`out/literature/papers/${paper.id}/index.html`), `Missing historical paper: ${paper.id}`);
}
// Most legacy redirects point at a specific source record's canonical page
// (historical /literature/papers/<id>/ URLs). A smoke export only renders a
// small sample of sources, so a redirect destination that is a real but
// unselected catalogue record is legitimately omitted, not broken; a
// destination whose id is not in the catalogue at all still fails, in every
// mode. Loaded lazily: only smoke runs need the full catalogue here.
const knownRecordIds = smoke ? new Set(JSON.parse(read('out/omics/catalogue.json')).records.map((record) => record.id)) : null;
for (const redirect of JSON.parse(read('firebase.json')).hosting.redirects || []) {
  const destination = new URL(redirect.destination, 'https://benchmarks.rewirebio.io');
  assert.equal(destination.origin, 'https://benchmarks.rewirebio.io', 'Unexpected external migration redirect');
  if (fs.existsSync(path.join('out', destination.pathname, 'index.html'))) continue;
  const databaseMatch = destination.pathname.match(/^\/database\/[a-z_]+\/([a-z0-9][a-z0-9._-]*)\/$/);
  if (smoke && databaseMatch && knownRecordIds.has(databaseMatch[1])) continue;
  assert.ok(false, `Redirect destination missing: ${redirect.destination}`);
}
for (const filename of ['papers.json', 'results.csv']) {
  assert.deepEqual(fs.readFileSync(`data/benchmark-literature/${filename}`), fs.readFileSync(`out/benchmark-literature/${filename}`));
}
for (const excluded of ['blog']) {
  assert.equal(fs.existsSync(path.join('out', excluded)), false, `Unexpected content: ${excluded}`);
}
// /benchmarks/ is now a deliberate index, not the old prefixed application.
assert.ok(fs.existsSync('out/benchmarks/index.html'), 'Benchmark index missing');
assert.ok(fs.existsSync('out/use-cases/index.html'), 'Use-case index missing');
assert.ok(read('out/index.html').includes('href="/use-cases/"'), 'Use cases must be visible from the homepage');
{
  const catalogueManifest = JSON.parse(read('out/omics/manifest.json'));
  const declaration = catalogueManifest.coverage?.use_cases;
  assert.equal(Boolean(declaration), Boolean(catalogueManifest.files['use-cases.json']), 'Use-case declaration must match its archive artifact');
  if (declaration) {
    const bytes = fs.readFileSync(`out/omics/releases/${catalogueManifest.release_id}/use-cases.json`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), catalogueManifest.files['use-cases.json']);
    const artifact = JSON.parse(bytes.toString('utf8'));
    assert.equal(artifact.release_id, catalogueManifest.release_id);
    assert.equal(artifact.input_sha256, declaration.input_sha256);
    for (const entry of artifact.use_cases) {
      if (smoke && !smoke.use_case_slugs.includes(entry.slug)) continue;
      assert.ok(fs.existsSync(`out/use-cases/${entry.slug}/index.html`), `Missing use-case page: ${entry.slug}`);
    }
  }
}
for (const entry of fs.readdirSync('out/benchmarks', { withFileTypes: true })) {
  assert.ok(entry.isFile() && ['index.html', 'index.txt'].includes(entry.name), `Obsolete benchmark-prefixed content: ${entry.name}`);
}
assert.equal(read('out/sitemap.xml').includes('https://rewire.it/'), false, 'Blog URL in database sitemap');
console.log('Extraction hashes, historical paper routes, MFASS, downloads and review-branch export verified.');

// Source-input preservation is checked by the independent data producer.
console.log('Website output checked against the pinned data artifact.');
