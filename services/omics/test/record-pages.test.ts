import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createCatalogueQuery } from '../src/catalogue-query.js';
import { createUseCaseQuery } from '../src/use-cases.js';
import { recordsDigest } from '../src/catalogue-integrity.js';
import { recordPageBuilder, recordPageRoutes, recordPageDocumentId } from '../src/record-pages.js';
import {
  RECORD_PAGE_COLLECTION, RECORD_PAGE_MANIFEST, decodeRecordPage, encodeRecordPage,
  importRecordPages, readRecordPage, verifyStoredRecordPages,
} from '../src/record-page-store.js';
import { fixture } from './fixtures.js';

/** In-memory Firestore: enough document, batch, transaction and projection
 * behaviour for the page store, with a count of every document read. */
function memoryDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const reads: string[] = [];
  const commits: number[] = [];
  const snapshot = (path: string) => {
    reads.push(path);
    const value = docs.get(path);
    return { exists: value !== undefined, id: path.split('/').at(-1)!, data: () => value && structuredClone(value) };
  };
  const apply = (path: string, update: Record<string, unknown>) => {
    const next = { ...(docs.get(path) || {}) };
    for (const [key, value] of Object.entries(update)) {
      if (value instanceof FieldValue) delete next[key]; else next[key] = value;
    }
    docs.set(path, next);
  };
  const ref = (path: string): any => ({
    id: path.split('/').at(-1), path,
    get: async () => snapshot(path),
    collection: (name: string) => ({
      doc: (id: string) => ref(`${path}/${name}/${id}`),
      get: async () => {
        const docsIn = [...docs.keys()].sort().filter(key => key.startsWith(`${path}/${name}/`) && !key.slice(path.length + name.length + 2).includes('/'));
        return { size: docsIn.length, docs: docsIn.map(snapshot) };
      },
      select: () => ({
        async *stream() {
          for (const key of [...docs.keys()].sort())
            if (key.startsWith(`${path}/${name}/`) && !key.slice(path.length + name.length + 2).includes('/')) yield snapshot(key);
        },
      }),
    }),
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    doc: (path: string) => ref(path),
    batch: () => {
      const writes: [string, Record<string, unknown>][] = [];
      return { set: (target: any, data: Record<string, unknown>) => writes.push([target.path, data]), commit: async () => { commits.push(writes.length); for (const [path, data] of writes) docs.set(path, data); } };
    },
    runTransaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      get: async (target: any) => snapshot(target.path),
      update: (target: any, data: Record<string, unknown>) => apply(target.path, data),
      set: (target: any, data: Record<string, unknown>) => docs.set(target.path, data),
    }),
  } as unknown as Firestore;
  return { db, docs, reads, commits };
}

const snapshot = fixture();
const bytes = Buffer.from(JSON.stringify(snapshot));
function importedRelease(extra: Record<string, unknown> = {}, release = snapshot, releaseBytes = bytes) {
  const memory = memoryDb();
  memory.docs.set(`catalogueReleases/${release.release_id}`, {
    state: 'ready', digest: createHash('sha256').update(releaseBytes).digest('hex'),
    records_digest: recordsDigest(release.records), record_count: release.records.length,
    schema_version: release.schema_version, released_at: release.released_at, coverage: {}, ...extra,
  });
  for (const record of release.records) memory.docs.set(`catalogueReleases/${release.release_id}/records/${record.id}`, record);
  return memory;
}

test('imports pages in bounded write batches rather than holding the release', async () => {
  const large = structuredClone(snapshot);
  const result = large.records.find((record: { kind: string }) => record.kind === 'result');
  for (let i = 0; i < 450; i++) large.records.push({ ...structuredClone(result), id: `extra-result-${String(i).padStart(3, '0')}` });
  const largeBytes = Buffer.from(JSON.stringify(large));
  const memory = importedRelease({}, large, largeBytes);
  const imported = await importRecordPages(memory.db, large.release_id, largeBytes);
  assert.equal(imported.pages, recordPageRoutes(large).length);
  assert.ok(memory.commits.length >= 3, 'flushes several batches');
  assert.ok(Math.max(...memory.commits) <= 200, 'no batch exceeds the flush bound');
});
const release = (memory: ReturnType<typeof memoryDb>) => memory.docs.get(`catalogueReleases/${snapshot.release_id}`)!;

test('materializes one verified document per result and evaluation route', async () => {
  const memory = importedRelease();
  const result = await importRecordPages(memory.db, snapshot.release_id, bytes);
  const routes = recordPageRoutes(snapshot);
  assert.equal(result.pages, routes.length);
  assert.deepEqual(routes.map(route => route.kind).sort(), ['evaluation', 'result']);
  const manifest = release(memory)[RECORD_PAGE_MANIFEST] as Record<string, unknown>;
  assert.equal(manifest.count, routes.length);
  assert.equal(release(memory)[`${RECORD_PAGE_MANIFEST}_lease`], undefined);
  const ref = memory.db.collection('catalogueReleases').doc(snapshot.release_id);
  await verifyStoredRecordPages(ref, release(memory));
});

test('refuses import for catalogue bytes that differ from the imported release', async () => {
  const memory = importedRelease();
  await assert.rejects(importRecordPages(memory.db, snapshot.release_id, Buffer.from(JSON.stringify({ ...snapshot, released_at: 'x' }))), /differ/);
});

test('an existing manifest does not vouch for deleted page documents', async () => {
  const memory = importedRelease();
  await importRecordPages(memory.db, snapshot.release_id, bytes);
  const [route] = recordPageRoutes(snapshot);
  memory.docs.delete(`catalogueReleases/${snapshot.release_id}/${RECORD_PAGE_COLLECTION}/${recordPageDocumentId(route.kind, route.record.id)}`);
  await assert.rejects(importRecordPages(memory.db, snapshot.release_id, bytes), /differ from their manifest/);
});

test('page reads are bounded: one release check per instance, one document per page', async () => {
  const memory = importedRelease({ published_at: '2026-10-01T00:00:00Z' });
  await importRecordPages(memory.db, snapshot.release_id, bytes);
  const [first, second] = recordPageRoutes(snapshot);
  memory.reads.length = 0;
  const page = await readRecordPage(memory.db, snapshot.release_id, first.kind, first.record.id);
  assert.equal(page?.detail.record.id, first.record.id);
  assert.equal(page?.release_id, snapshot.release_id);
  assert.equal(memory.reads.length, 2);
  await readRecordPage(memory.db, snapshot.release_id, second.kind, second.record.id);
  assert.equal(memory.reads.length, 3, 'published release metadata is checked once per warm instance');
  assert.ok(memory.reads.every(path => !path.includes('/queryChunks/')), 'never loads the release snapshot');
});

test('absent and wrong-kind records are 404s; a renderable record without its page is a failure', async () => {
  const memory = importedRelease({ published_at: '2026-10-01T00:00:00Z' });
  await importRecordPages(memory.db, snapshot.release_id, bytes);
  assert.equal(await readRecordPage(memory.db, snapshot.release_id, 'result', 'does-not-exist'), null);
  assert.equal(await readRecordPage(memory.db, snapshot.release_id, 'result', 'model-one'), null);
  const evaluation = recordPageRoutes(snapshot).find(route => route.kind === 'evaluation')!;
  memory.docs.delete(`catalogueReleases/${snapshot.release_id}/${RECORD_PAGE_COLLECTION}/${recordPageDocumentId('evaluation', evaluation.record.id)}`);
  await assert.rejects(readRecordPage(memory.db, snapshot.release_id, 'evaluation', evaluation.record.id), { code: 'PRECONDITION_FAILED' });
});

test('unpublished releases and releases without materialized pages are failures, not 404s', async () => {
  const unpublished = importedRelease();
  await importRecordPages(unpublished.db, snapshot.release_id, bytes);
  await assert.rejects(readRecordPage(unpublished.db, snapshot.release_id, 'result', 'x'), { code: 'PRECONDITION_FAILED' });
  const legacy = importedRelease({ published_at: '2026-10-01T00:00:00Z' });
  await assert.rejects(readRecordPage(legacy.db, snapshot.release_id, 'result', 'x'), { code: 'PRECONDITION_FAILED' });
});

test('damaged or misrouted documents are integrity failures', async () => {
  const memory = importedRelease({ published_at: '2026-10-01T00:00:00Z' });
  await importRecordPages(memory.db, snapshot.release_id, bytes);
  const [route] = recordPageRoutes(snapshot);
  const path = `catalogueReleases/${snapshot.release_id}/${RECORD_PAGE_COLLECTION}/${recordPageDocumentId(route.kind, route.record.id)}`;
  memory.docs.set(path, { ...memory.docs.get(path), sha256: '0'.repeat(64) });
  await assert.rejects(readRecordPage(memory.db, snapshot.release_id, route.kind, route.record.id), { code: 'INTERNAL_SERVER_ERROR' });
  const stored = memory.docs.get(path)!;
  assert.throws(() => decodeRecordPage(stored, 'other-release', route.kind, route.record.id), /does not match/);
});

test('oversized pages are rejected rather than truncated', () => {
  const query = createCatalogueQuery(snapshot);
  const build = recordPageBuilder(query, createUseCaseQuery(snapshot, undefined, undefined, query));
  const [route] = recordPageRoutes(snapshot);
  const page = build(route.kind, route.record.id)!;
  page.detail.record = { ...page.detail.record, description: createHash('sha256').update('x').digest('base64').repeat(400_000) };
  assert.throws(() => encodeRecordPage(page), /serving limit/);
});

test('direct activation of an imported release prepares and verifies its pages first', async () => {
  const memory = importedRelease();
  const { activateRelease } = await import('../src/catalogue-service.js');
  await activateRelease(memory.db, snapshot.release_id);
  const meta = release(memory);
  assert.equal((meta[RECORD_PAGE_MANIFEST] as { count: number }).count, recordPageRoutes(snapshot).length);
  assert.ok(meta.published_at);
  assert.equal(memory.docs.get('cataloguePublication/active')?.release_id, snapshot.release_id);
});

test('pages keep alias routes and refuse a kind the record does not route to', () => {
  const aliased = structuredClone(snapshot);
  const evaluation = aliased.records.find((record: { kind: string }) => record.kind === 'evaluation');
  evaluation.attributes.legacy_kinds = ['result'];
  const query = createCatalogueQuery(aliased);
  const build = recordPageBuilder(query, createUseCaseQuery(aliased, undefined, undefined, query));
  assert.ok(recordPageRoutes(aliased).some(route => route.kind === 'result' && route.record.id === evaluation.id));
  assert.equal(build('result', evaluation.id)?.detail.record.kind, 'evaluation');
  assert.equal(build('evaluation', 'model-one'), null);
});
