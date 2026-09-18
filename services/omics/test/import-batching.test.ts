import test from "node:test";
import assert from "node:assert/strict";
import { BATCH_LIMITS, commitInBatches } from "../src/catalogue.js";

/**
 * Firestore rejects a request over about 11 MB. A query chunk holds up to
 * 700 KB, so a batch counted in documents rather than bytes goes over long
 * before it reaches its document limit, and the import fails partway through
 * with an opaque INVALID_ARGUMENT.
 */
function fakeDb() {
  const commits: { ref: string; bytes: number }[][] = [];
  let pending: { ref: string; bytes: number }[] = [];
  return {
    commits,
    db: {
      batch() {
        pending = [];
        const current = pending;
        return {
          set(ref: { path: string }, data: Record<string, unknown>) {
            current.push({
              ref: ref.path,
              bytes: Buffer.byteLength(JSON.stringify(data)),
            });
          },
          async commit() {
            commits.push([...current]);
          },
        };
      },
    },
  };
}

const write = (path: string, bytes: number) => ({
  ref: { path } as never,
  data: { blob: "x".repeat(bytes) },
});

test("splits a commit before it passes the request size limit", async () => {
  const { db, commits } = fakeDb();
  const writes = Array.from({ length: 40 }, (_, i) =>
    write(`chunk/${i}`, 700_000),
  );
  await commitInBatches(db as never, writes);
  assert.ok(commits.length > 1, "40 chunks of 700 KB cannot be one request");
  // A batch is closed when the next write would pass the budget, so it can
  // overshoot by one document. The caller refuses any record over 700 KB, which
  // bounds the overshoot well short of the 11 MB the request limit allows.
  const maxDocument = 700_000;
  for (const batch of commits) {
    const bytes = batch.reduce((total, entry) => total + entry.bytes, 0);
    assert.ok(
      bytes <= BATCH_LIMITS.bytes + maxDocument,
      `batch of ${bytes} bytes is over budget`,
    );
  }
});

test("still splits on the write count for small documents", async () => {
  const { db, commits } = fakeDb();
  const writes = Array.from({ length: 1000 }, (_, i) =>
    write(`records/${i}`, 10),
  );
  await commitInBatches(db as never, writes);
  assert.equal(commits.length, 3);
  for (const batch of commits)
    assert.ok(batch.length <= BATCH_LIMITS.writes, "batch exceeds write limit");
});

test("commits every write exactly once, in order", async () => {
  const { db, commits } = fakeDb();
  const writes = Array.from({ length: 950 }, (_, i) =>
    write(`records/${i}`, 50_000),
  );
  await commitInBatches(db as never, writes);
  const paths = commits.flat().map((entry) => entry.ref);
  assert.equal(paths.length, 950);
  assert.equal(new Set(paths).size, 950);
  assert.deepEqual(
    paths,
    writes.map((w) => (w.ref as { path: string }).path),
  );
});

test("commits nothing when there is nothing to write", async () => {
  const { db, commits } = fakeDb();
  await commitInBatches(db as never, []);
  assert.equal(commits.length, 0);
});
