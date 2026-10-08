import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

export async function pinnedDownloads(read = readFile) {
  const lock = JSON.parse(await read(new URL('../benchmark-data.lock.json', import.meta.url), 'utf8'));
  const locations = JSON.parse(await read(new URL('../lib/generated-download-locations.json', import.meta.url), 'utf8'));
  assert.equal(locations.repository, lock.repository, 'Download producer must match lock');
  assert.equal(locations.revision, lock.revision, 'Download revision must match lock');
  assert.equal(locations.manifest_sha256, lock.manifest_sha256, 'Download inventory must match lock');
  assert.match(lock.revision, /^[a-f0-9]{40}$/);
  assert.equal(lock.repository, 'rewire-bio/rewire-benchmark-data');
  const urls = new Map();
  for (const group of locations.groups) for (const file of group.files) {
    assert.ok(!file.includes('/') && !file.includes('..'), 'Unsafe download name');
    assert.match(group.source, /^(website\/files\/public|data\/omics\/releases)\/[a-zA-Z0-9._/-]+$/);
    assert.ok(!group.source.split('/').includes('..'), 'Unsafe download source');
    urls.set(`${group.destination}/${file}`, `https://raw.githubusercontent.com/${lock.repository}/${lock.revision}/${group.source}/${encodeURIComponent(file)}.gz`);
  }
  return { lock, urls };
}
export function assertProducerReceipt(receipt, lock, release) {
  assert.equal(receipt.schema, 2, 'Independent frontend receipt must identify its producer');
  assert.equal(receipt.release_id, release, 'Frontend receipt release must match');
  assert.equal(receipt.producer_repository, lock.repository, 'Frontend producer must match checked pin');
  assert.equal(receipt.producer_revision, lock.revision, 'Frontend data revision must match checked pin');
}
export async function fetchGithubDownload(origin, pathname, downloads, request, { head = false } = {}) {
  const expected = downloads.urls.get(pathname);
  assert.ok(expected, `Download absent from checked producer manifest: ${pathname}`);
  const redirect = await request(new URL(pathname, origin), { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.ok([301,302,307,308].includes(redirect.status), 'Legacy download must redirect to GitHub');
  assert.equal(redirect.headers.get('location'), expected, 'Download redirect must target the exact pinned producer file');
  const response = await request(new URL(expected), { method: head ? 'HEAD' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'Pinned GitHub export must be publicly accessible');
  assert.ok(!response.headers.get('content-type')?.includes('text/html'), 'GitHub download returned HTML');
  if (head) { if(response.headers.has('content-length')) assert.ok(Number(response.headers.get('content-length')) > 0, 'Empty GitHub download'); return; }
  const maxCompressed = 64 * 1024 ** 2;
  if(response.headers.has('content-length')) assert.ok(Number(response.headers.get('content-length')) <= maxCompressed, 'Compressed export exceeds probe budget');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxCompressed) { throw new Error('Compressed export exceeds probe budget'); }
    chunks.push(Buffer.from(chunk));
  }
  return gunzipSync(Buffer.concat(chunks), { maxOutputLength: 512 * 1024 ** 2 });
}
