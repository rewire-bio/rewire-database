import { describe, expect, it } from 'vitest';
import { backendCurrent, beginBackend, completeBackend } from '../scripts/backend-deployment.mjs';

function fixture() {
  let marker: any;
  const ref = { set: async (value: any) => { marker = value; } };
  const db = { runTransaction: async (run: any) => run({ get: async () => ({ data: () => marker }), set: (_ref: any, value: any) => { marker = value; } }) };
  return { ref, db, marker: () => marker };
}
describe('independent backend deployment state', () => {
  const before = 'a'.repeat(64), after = 'b'.repeat(64);
  it('requires bootstrap, then records only successfully completed deployments', async () => {
    const f = fixture();
    expect(backendCurrent(f.marker(), before)).toBe(false);
    await beginBackend(f.ref, before, 'run1');
    expect(backendCurrent(f.marker(), before)).toBe(false);
    await completeBackend(f.db, f.ref, before, 'run1');
    expect(backendCurrent(f.marker(), before)).toBe(true);
    expect(backendCurrent(f.marker(), after)).toBe(false);
  });
  it('requires retry after partial failure even when Hosting still has the old receipt', async () => {
    const f = fixture();
    await beginBackend(f.ref, before, 'run1'); await completeBackend(f.db, f.ref, before, 'run1');
    await beginBackend(f.ref, after, 'failed-run');
    expect(backendCurrent(f.marker(), before)).toBe(false);
    expect(backendCurrent(f.marker(), after)).toBe(false);
  });
  it('does not mistake Hosting rollback for a backend rollback', async () => {
    const f = fixture();
    await beginBackend(f.ref, after, 'run2'); await completeBackend(f.db, f.ref, after, 'run2');
    // Website fails and returns to the older receipt; backend marker stays newer.
    expect(backendCurrent(f.marker(), before)).toBe(false);
    expect(backendCurrent(f.marker(), after)).toBe(true);
  });
  it('cannot complete an attempt after another deployment takes ownership', async () => {
    const f = fixture();
    await beginBackend(f.ref, before, 'first'); await beginBackend(f.ref, after, 'second');
    await expect(completeBackend(f.db, f.ref, before, 'first')).rejects.toThrow('ownership changed');
    expect(backendCurrent(f.marker(), after)).toBe(false);
  });
});
