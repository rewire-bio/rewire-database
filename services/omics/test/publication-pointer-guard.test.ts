import test from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';
import { activateRelease } from '../src/catalogue-service.js';
import { fixture } from './fixtures.js';

function publication(current: string) {
  const snapshot = fixture();
  const metadata = { ...snapshot, state: 'ready', record_count: snapshot.records.length, digest: 'checked' };
  const writes: unknown[] = [];
  const release = {
    get: async () => ({ data: () => metadata }),
    collection: () => ({ get: async () => ({ docs: snapshot.records.map(record => ({ data: () => record })) }) }),
  };
  const db = {
    collection: () => ({ doc: () => release }),
    doc: (name: string) => name,
    runTransaction: async (operation: (tx: unknown) => Promise<unknown>) => operation({
      get: async (ref: unknown) => ({ data: () => ref === 'cataloguePublication/active'
        ? { release_id: current } : metadata }),
      update: (ref: unknown, value: unknown) => writes.push([ref, value]),
      set: (ref: unknown, value: unknown) => writes.push([ref, value]),
    }),
  } as unknown as Firestore;
  return { db, snapshot, writes };
}

test('activation compares the publication pointer inside its write transaction', async () => {
  const { db, snapshot, writes } = publication('previous');
  const result = await activateRelease(db, snapshot.release_id, { expectedPreviousReleaseId: 'previous' });
  assert.equal(result.previous_release_id, 'previous');
  assert.equal(writes.length, 2);
});

test('activation refuses a concurrent publication without updating metadata or the pointer', async () => {
  const { db, snapshot, writes } = publication('intervening');
  await assert.rejects(() => activateRelease(db, snapshot.release_id,
    { expectedPreviousReleaseId: 'previous' }), /pointer changed/);
  assert.equal(writes.length, 0);
});

test('existing explicit operator activation remains compatible without an expected pointer', async () => {
  const { db, snapshot, writes } = publication('previous');
  await activateRelease(db, snapshot.release_id);
  assert.equal(writes.length, 2);
});
