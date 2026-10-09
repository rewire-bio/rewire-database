import { describe, expect, it, vi } from 'vitest';
import { candidateSamples, publishFrontend } from '../scripts/deploy-independent-frontend.mjs';

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
  it("prunes old revisions only after acceptance, and never fails the publication over it", async () => {
    const prune = vi.fn(async () => { throw Error("permission denied"); });
    const revision = { previous: 'rev-old', revision: 'rev-new', url: 'https://x.a.run.app', rollback: vi.fn(), prune };
    await expect(publishFrontend({ deployRevision: async () => revision, publishEdge: async () => {} })).resolves.toBe(revision);
    expect(prune).toHaveBeenCalledOnce();
    const failing = { ...revision, prune: vi.fn() };
    await expect(publishFrontend({ deployRevision: async () => failing, publishEdge: async () => { throw Error('acceptance'); } })).rejects.toThrow();
    expect(failing.prune).not.toHaveBeenCalled();
  });
});
