import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const reviewRelease = '2026-09-22-f58a0f1d267f';
export const domainIds = ['dna-genomes', 'rna-transcriptomes', 'proteins-complexes', 'cells-tissues', 'microbes-communities', 'molecular-interactions'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function reviewedRedirects() {
  const archivePath = `data/omics/releases/${reviewRelease}/catalogue.json.gz`;
  const archive = fs.readFileSync(archivePath);
  const catalogue = JSON.parse(gunzipSync(archive));
  const paperBytes = fs.readFileSync('data/benchmark-literature/papers.json');
  const scopeBytes = fs.readFileSync('data/omics/scope-audit.jsonl');
  const papers = JSON.parse(paperBytes);
  const scope = scopeBytes.toString().trim().split('\n').map(line => JSON.parse(line));
  const mappings = [], excluded = [];
  for (const paper of papers) {
    const record = catalogue.records.find(record => record.id === paper.id && record.kind === 'source' && record.status !== 'excluded');
    const decision = scope.find(entry => entry.paper_id === paper.id);
    if (!record) {
      assert.equal(decision?.decision, 'excluded', `Unresolved legacy paper ${paper.id}`);
      excluded.push({ paper_id: paper.id, reason: decision.reason });
      continue;
    }
    assert.equal(decision?.decision, 'included', `Unreviewed legacy source ${paper.id}`);
    // Exact inherited identity, not a title/name similarity or a blanket path capture.
    assert.deepEqual(record.attributes.legacy_paper, paper, `Legacy identity changed: ${paper.id}`);
    assert.equal(record.name, paper.title);
    assert.equal(record.attributes.url, paper.source_url);
    assert.equal(record.attributes.version, paper.version);
    mappings.push({ paper_id: paper.id, source_id: record.id, source_url: paper.source_url, source_version: paper.version, destination: `/database/source/${record.id}/` });
  }
  const redirects = [
    { source: '/database{,/}', destination: '/', type: 301 },
    { source: '/literature{,/}', destination: '/?kind=result&origin=literature', type: 301 },
    ...domainIds.map(id => ({ source: `/${id}{,/}`, destination: `/?kind=model&area=${id}`, type: 301 })),
    ...mappings.map(mapping => ({ source: `/literature/papers/${mapping.paper_id}{,/}`, destination: mapping.destination, type: 301 })),
  ];
  return {
    review: { reviewed_at: '2026-09-23', review_method: 'Automated exact historical-paper/source identity comparison; no new scientific claims', release_id: reviewRelease, inputs: { [archivePath]: digest(archive), 'data/benchmark-literature/papers.json': digest(paperBytes), 'data/omics/scope-audit.jsonl': digest(scopeBytes) }, mappings, excluded },
    redirects,
  };
}
