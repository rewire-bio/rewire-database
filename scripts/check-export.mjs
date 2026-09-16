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
for (const paper of JSON.parse(read('data/benchmark-literature/papers.json'))) {
  assert.ok(fs.existsSync(`out/literature/papers/${paper.id}/index.html`), `Missing historical paper: ${paper.id}`);
}
for (const filename of ['papers.json', 'results.csv']) {
  assert.deepEqual(fs.readFileSync(`data/benchmark-literature/${filename}`), fs.readFileSync(`out/benchmark-literature/${filename}`));
}
for (const excluded of ['blog', 'benchmarks', 'database', 'contribute', 'omics']) {
  assert.equal(fs.existsSync(path.join('out', excluded)), false, `Unexpected content: ${excluded}`);
}
assert.equal(read('out/sitemap.xml').includes('https://rewire.it/'), false, 'Blog URL in database sitemap');
console.log('Extraction hashes, historical paper routes, MFASS, downloads and production-only export verified.');
