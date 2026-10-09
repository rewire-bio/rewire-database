import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export const reviewRelease = '2026-09-22-f58a0f1d267f';
export const domainIds = ['dna-genomes', 'rna-transcriptomes', 'proteins-complexes', 'cells-tissues', 'microbes-communities', 'molecular-interactions'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function reviewedRedirects() {
  // Preserve the original redirect review; validate its identities against the
  // pinned prepared catalogue without requiring a producer source archive.
  const review = JSON.parse(fs.readFileSync('docs/seo/legacy-redirect-review-2026-09-23.json', 'utf8'));
  assert.equal(review.release_id, reviewRelease);
  const catalogue = JSON.parse(fs.readFileSync('public/omics/catalogue.json', 'utf8'));
  assert.equal(catalogue.release_id, JSON.parse(fs.readFileSync('benchmark-data.lock.json', 'utf8')).release_id);
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
    // Since declared attributes (data #54) the copied legacy_paper block lives in producer
    // provenance, not on the record, so check the identity fields the source still carries.
    const identity = { title: record.name, source_url: record.attributes.url, version: record.attributes.version, year: record.attributes.year, doi: record.attributes.doi ?? undefined };
    const expected = { title: paper.title, source_url: paper.source_url, version: paper.version, year: paper.year, doi: paper.doi ?? undefined };
    assert.deepEqual(identity, expected, `Legacy identity changed: ${paper.id}`);
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
  assert.deepEqual(mappings, review.mappings, 'Released legacy mappings differ from reviewed redirects');
  assert.deepEqual(excluded, review.excluded, 'Released legacy exclusions differ from reviewed redirects');
  assert.equal(digest(paperBytes), review.inputs['data/benchmark-literature/papers.json']);
  // scope-audit.jsonl is append-only, so later decisions about other papers change its bytes.
  // The redirects depend only on the decisions for these papers, checked above one by one.
  for (const paper of papers)
    assert.equal(scope.filter(entry => entry.paper_id === paper.id).length, 1, `Expected one scope decision for ${paper.id}`);
  return { review, redirects };
}
