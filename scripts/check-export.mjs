import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { historicalExportPaths } from './omics/export-scope.mjs';
const read = (file) => fs.readFileSync(file, 'utf8');
const currentOnly = process.argv.includes('--current-only');
const currentRelease = JSON.parse(read('out/omics/manifest.json')).release_id;
const historicalPaths = currentOnly ? historicalExportPaths(currentRelease) : new Set();
const manifest = JSON.parse(read('docs/extraction-manifest.json'));
for (const row of manifest.files.filter((row) => row.destination_path.startsWith('data/'))) {
  assert.equal(createHash('sha256').update(fs.readFileSync(row.destination_path)).digest('hex'), row.source_sha256, `Historical data changed: ${row.destination_path}`);
}
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
for (const redirect of JSON.parse(read('firebase.json')).hosting.redirects || []) {
  const destination = new URL(redirect.destination, 'https://benchmarks.rewirebio.io');
  assert.equal(destination.origin, 'https://benchmarks.rewirebio.io', 'Unexpected external migration redirect');
  assert.ok(fs.existsSync(path.join('out', destination.pathname, 'index.html')), `Redirect destination missing: ${redirect.destination}`);
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
    for (const entry of artifact.use_cases) assert.ok(fs.existsSync(`out/use-cases/${entry.slug}/index.html`), `Missing use-case page: ${entry.slug}`);
  }
}
for (const entry of fs.readdirSync('out/benchmarks', { withFileTypes: true })) {
  assert.ok(entry.isFile() && ['index.html', 'index.txt'].includes(entry.name), `Obsolete benchmark-prefixed content: ${entry.name}`);
}
assert.equal(read('out/sitemap.xml').includes('https://rewire.it/'), false, 'Blog URL in database sitemap');
console.log('Extraction hashes, historical paper routes, MFASS, downloads and review-branch export verified.');

const review = JSON.parse(read('docs/review-extraction-manifest.json'));
// The current pointer and release timestamp advance; the original release stays byte-identical.
const mutablePointers = new Set(['data/omics/release-config.json', 'public/omics/catalogue.json', 'public/omics/manifest.json']);
for (const row of review.files.filter(row => /^(data\/|public\/omics\/)/.test(row.destination_path) && !mutablePointers.has(row.destination_path))) {
  // The deployment composes these receipted historical paths with the prior
  // Hosting version; input records and every current artifact still get checked.
  if (row.destination_path.startsWith('public/') && historicalPaths.has(row.destination_path.slice('public'.length))) continue;
  assert.equal(createHash('sha256').update(fs.readFileSync(row.destination_path)).digest('hex'), row.source_sha256, `Preserved review data changed: ${row.destination_path}`);
}
console.log('Historical input records and archived release bytes match their extraction receipt.');
