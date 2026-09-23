import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const read = (file) => fs.readFileSync(file, 'utf8');
const manifest = JSON.parse(read('docs/extraction-manifest.json'));
for (const row of manifest.files.filter((row) => row.destination_path.startsWith('data/'))) {
  assert.equal(createHash('sha256').update(fs.readFileSync(row.destination_path)).digest('hex'), row.source_sha256, `Historical data changed: ${row.destination_path}`);
}
assert.ok(read('out/index.html').includes('id="mfass-v1"'), 'Historical MFASS anchor missing');
assert.ok(read('out/index.html').includes('https://benchmarks.rewire.it/'), 'Database canonical missing');
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
for (const filename of ['papers.json', 'results.csv']) {
  assert.deepEqual(fs.readFileSync(`data/benchmark-literature/${filename}`), fs.readFileSync(`out/benchmark-literature/${filename}`));
}
for (const excluded of ['blog', 'benchmarks']) {
  assert.equal(fs.existsSync(path.join('out', excluded)), false, `Unexpected content: ${excluded}`);
}
assert.equal(read('out/sitemap.xml').includes('https://rewire.it/'), false, 'Blog URL in database sitemap');
console.log('Extraction hashes, historical paper routes, MFASS, downloads and review-branch export verified.');

const review = JSON.parse(read('docs/review-extraction-manifest.json'));
// The current pointer and release timestamp advance; the original release stays byte-identical.
const mutablePointers = new Set(['data/omics/release-config.json', 'public/omics/catalogue.json', 'public/omics/manifest.json']);
for (const row of review.files.filter(row => /^(data\/|public\/omics\/)/.test(row.destination_path) && !mutablePointers.has(row.destination_path))) {
  assert.equal(createHash('sha256').update(fs.readFileSync(row.destination_path)).digest('hex'), row.source_sha256, `Preserved review data changed: ${row.destination_path}`);
}
console.log('Historical input records and archived release bytes match their extraction receipt.');
