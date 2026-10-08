import { describe, expect, it, vi } from 'vitest';
import {
  candidateSamples,
  currentApiRelease,
  deployIndependentFrontend,
  preparePages,
  probePages,
  publishFrontend,
  restorePublicationPointer,
} from '../scripts/deploy-independent-frontend.mjs';

const old = '2026-10-01-111111111111';
const next = '2026-10-07-222222222222';

function operations({ same = false, fail = '' } = {}) {
  const calls: string[] = [];
  const op = (name: string) => vi.fn(async (..._args: unknown[]) => {
    calls.push(name);
    if (name === fail) throw Error(name);
  });
  const actions = {
    releaseId: same ? old : next,
    capture: vi.fn(async () => old),
    assertBase: op('base'),
    importRelease: op('import'),
    preparePages: op('pages'),
    activate: op('activate'),
    verifyApi: op('api'),
    publishFrontend: op('cloudflare'),
    restoreRelease: op('restore'),
  };
  return { actions, calls };
}

describe('independent frontend publication', () => {
  it('publishes a UI update without loading/importing/activating any backend data', async () => {
    const { actions, calls } = operations({ same: true });
    await expect(deployIndependentFrontend(actions)).resolves.toEqual({ release_id: old, catalogue_changed: false });
    expect(calls).toEqual(['base', 'pages', 'api', 'cloudflare']);
    expect(actions.activate).not.toHaveBeenCalled();
    expect(actions.importRelease).not.toHaveBeenCalled();
    expect(actions.preparePages).toHaveBeenCalledWith(old, false);
  });

  it('imports immutable current data before guarded activation and frontend upload', async () => {
    const { actions, calls } = operations();
    await deployIndependentFrontend(actions);
    expect(calls).toEqual(['base', 'import', 'pages', 'activate', 'api', 'cloudflare']);
    expect(actions.activate).toHaveBeenCalledWith(next, old);
    expect(actions.preparePages).toHaveBeenCalledWith(next, true);
  });

  it.each(['base', 'import', 'pages'])('does not restore any live pointer when %s fails before activation', async fail => {
    const { actions } = operations({ fail });
    await expect(deployIndependentFrontend(actions)).rejects.toThrow(fail);
    expect(actions.activate).not.toHaveBeenCalled();
    expect(actions.restoreRelease).not.toHaveBeenCalled();
    expect(actions.publishFrontend).not.toHaveBeenCalled();
  });

  it.each(['activate', 'api', 'cloudflare'])('restores its previous pointer after an ambiguous %s failure', async fail => {
    const { actions } = operations({ fail });
    await expect(deployIndependentFrontend(actions)).rejects.toThrow('pointer retained or restored');
    expect(actions.restoreRelease).toHaveBeenCalledWith(old, next);
  });

  it('lets Cloudflare finish its own rollback before restoring the data pointer', async () => {
    const { actions, calls } = operations();
    actions.publishFrontend.mockImplementation(async () => {
      calls.push('cloudflare', 'cloudflare-rollback');
      throw Error('Worker restored');
    });
    await expect(deployIndependentFrontend(actions)).rejects.toThrow('pointer retained or restored');
    expect(calls.slice(-3)).toEqual(['cloudflare', 'cloudflare-rollback', 'restore']);
  });

  it('does not roll back backend data after a failed UI-only deployment', async () => {
    const { actions } = operations({ same: true, fail: 'cloudflare' });
    await expect(deployIndependentFrontend(actions)).rejects.toThrow('pointer retained or restored');
    expect(actions.restoreRelease).not.toHaveBeenCalled();
  });

  it('reports both publication and guarded rollback failures', async () => {
    const { actions } = operations({ fail: 'cloudflare' });
    actions.restoreRelease.mockRejectedValue(Error('concurrent publisher'));
    let caught: AggregateError | undefined;
    try { await deployIndependentFrontend(actions); } catch (error) { caught = error as AggregateError; }
    expect(caught?.message).toContain('operator attention');
    expect(caught?.errors.map(error => error.message)).toEqual(['cloudflare', 'concurrent publisher']);
  });

  it('refuses publication without an existing valid rollback release', async () => {
    const { actions } = operations();
    actions.capture.mockResolvedValue('');
    await expect(deployIndependentFrontend(actions)).rejects.toThrow('existing API release');
    expect(actions.assertBase).not.toHaveBeenCalled();
  });
});

describe('prepared page readiness before traffic', () => {
  const complete = { state: 'ready', published_at: '2026-10-07', records_digest: 'r', record_pages_v1: { schema_version: '1.0', count: 21678, records_digest: 'r' } };
  const steps = () => ({ backfill: vi.fn(async () => undefined), verifyStored: vi.fn(async () => undefined), probe: vi.fn(async () => undefined) });
  const run = (changed: boolean, meta: object | undefined, s = steps()) =>
    preparePages({ changed, meta: meta as never, manifestKey: 'record_pages_v1', schema: '1.0', ...s }).then(() => s);
  it('a frontend-only publication of the complete published release never enumerates every stored page', async () => {
    const s = await run(false, complete);
    expect(s.verifyStored).not.toHaveBeenCalled();
    expect(s.backfill).not.toHaveBeenCalled();
    expect(s.probe).toHaveBeenCalledOnce();
  });
  it('backfills and fully verifies a release that has no pages yet', async () => {
    const s = await run(false, { ...complete, record_pages_v1: undefined });
    expect(s.backfill).toHaveBeenCalledOnce();
    expect(s.verifyStored).toHaveBeenCalledOnce();
    expect(s.probe).not.toHaveBeenCalled();
  });
  it('fully verifies every stored page of a newly imported release', async () => {
    const s = await run(true, complete);
    expect(s.verifyStored).toHaveBeenCalledOnce();
    expect(s.probe).not.toHaveBeenCalled();
  });
  it.each([
    ['another records digest', { records_digest: 'changed' }],
    ['another page contract', { record_pages_v1: { ...complete.record_pages_v1, schema_version: '2.0' } }],
    ['an unpublished release', { published_at: undefined }],
  ])('refuses a published release whose manifest has %s', async (_name, change) => {
    await expect(run(false, { ...complete, ...change })).rejects.toThrow('full publication');
  });
  it('probes result and evaluation pages through the public API for the pinned release', async () => {
    const release = '2026-10-07-aaaaaaaaaaaa';
    const fetchImpl = vi.fn(async (url: string) => {
      const input = JSON.parse(decodeURIComponent(new URL(url).searchParams.get('input')!));
      return new Response(JSON.stringify({ result: { data: { release_id: input.release_id, route_kind: input.kind, detail: { record: { id: input.id } } } } }),
        { headers: { 'Content-Type': 'application/json' } });
    });
    await probePages(release, ['/database/result/r1/', '/database/evaluation/e1/', '/database/model/m1/'], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const missing = vi.fn(async () => new Response(JSON.stringify({ result: { data: null } }), { headers: { 'Content-Type': 'application/json' } }));
    await expect(probePages(release, ['/database/result/r1/'], { fetchImpl: missing })).rejects.toThrow('not served');
  });
});

describe('frontend publication rollback order', () => {
  it('moves traffic back to the previous Cloud Run revision when public acceptance fails', async () => {
    const rollback = vi.fn(async () => undefined);
    const revision = { previous: 'rev-old', revision: 'rev-new', url: 'https://x.a.run.app', rollback };
    await expect(publishFrontend({ deployRevision: async () => revision, publishEdge: async () => { throw Error('acceptance'); } }))
      .rejects.toThrow('traffic restored to rev-old');
    expect(rollback).toHaveBeenCalledOnce();
  });
  it('does not touch traffic when the candidate revision itself fails verification', async () => {
    const publishEdge = vi.fn();
    await expect(publishFrontend({ deployRevision: async () => { throw Error('candidate failed'); }, publishEdge })).rejects.toThrow('candidate failed');
    expect(publishEdge).not.toHaveBeenCalled();
  });
  it('reports a failed traffic rollback for operator attention', async () => {
    const revision = { previous: 'rev-old', revision: 'rev-new', url: 'https://x.a.run.app', rollback: async () => { throw Error('gcloud'); } };
    await expect(publishFrontend({ deployRevision: async () => revision, publishEdge: async () => { throw Error('acceptance'); } }))
      .rejects.toThrow('operator attention');
  });
  it('verifies candidates on each server-rendered and prerendered-era page kind of the pinned release', () => {
    const record = (id: string, kind: string, status = 'source_checked') => ({ id, kind, status });
    expect(candidateSamples({ records: [record('r0', 'result', 'excluded'), record('r1', 'result'), record('e1', 'evaluation'), record('m1', 'model'), record('b1', 'benchmark')] }))
      .toEqual(['/database/result/r1/', '/database/evaluation/e1/', '/database/model/m1/', '/database/benchmark/b1/']);
    expect(() => candidateSamples({ records: [record('m1', 'model')] })).toThrow('no result');
  });
});

function pointerDb(current: string) {
  const writes: unknown[] = [];
  const db = {
    doc: (name: string) => name,
    runTransaction: async (operation: (tx: unknown) => Promise<void>) => operation({
      get: async (ref: string) => ({ data: () => ref === 'cataloguePublication/active'
        ? { release_id: current } : { state: 'ready', published_at: '2026-10-01' } }),
      set: (ref: unknown, value: unknown) => writes.push([ref, value]),
    }),
  };
  return { db, writes };
}

describe('catalogue pointer rollback ownership', () => {
  it('restores the published previous release in a single transaction', async () => {
    const { db, writes } = pointerDb(next);
    await restorePublicationPointer(db, old, next);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(['cataloguePublication/active', expect.objectContaining({ release_id: old })]);
  });
  it('is a no-op when the failed activation never changed the pointer', async () => {
    const { db, writes } = pointerDb(old);
    await restorePublicationPointer(db, old, next);
    expect(writes).toHaveLength(0);
  });
  it('refuses to overwrite an intervening publication', async () => {
    const { db, writes } = pointerDb('2026-10-08-333333333333');
    await expect(restorePublicationPointer(db, old, next)).rejects.toThrow('changed during rollback');
    expect(writes).toHaveLength(0);
  });
});

describe('public API capture', () => {
  it('reads the direct API without credentials or Firebase Hosting', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: { data: { release_id: old } } }),
      { headers: { 'Content-Type': 'application/json' } }));
    await expect(currentApiRelease({ fetchImpl })).resolves.toBe(old);
    const [url, options] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('cloudfunctions.net/contributions/api/trpc/catalogue.release');
    expect(options.redirect).toBe('manual');
    expect(options.headers).not.toHaveProperty('Authorization');
  });
  it('fails closed for an invalid release response', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ result: { data: { release_id: 'invalid' } } }),
      { headers: { 'Content-Type': 'application/json' } });
    await expect(currentApiRelease({ fetchImpl })).rejects.toThrow('invalid catalogue release');
  });
});
