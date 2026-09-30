import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assertPublishedBase, classify, fingerprints, inputGroups, publishedReceipt, validReceipt, writeReceipt } from '../scripts/deployment-plan.mjs';

const roots: string[] = [];
const hashes = { data: 'a'.repeat(64), backend: 'b'.repeat(64), hosting: 'c'.repeat(64) };
const receipt = { schema: 1, commit: 'd'.repeat(40), fingerprints: hashes,
  release_id: '2026-09-29-06401fd5b220', manifest_sha256: 'e'.repeat(64) };
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-plan-')); roots.push(root);
  execFileSync('git', ['init', '-q', root]);
  return root;
}
function file(root: string, name: string, contents: string, track = true) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), contents);
  if (track) execFileSync('git', ['add', name], { cwd: root });
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true }); });

describe('publication classification', () => {
  it('bootstraps and forces full work; only a valid live receipt permits skips', () => {
    expect(classify(hashes, null)).toEqual({ mode: 'full', backend: true });
    expect(classify(hashes, { ...receipt, schema: 999 })).toEqual({ mode: 'full', backend: true });
    expect(classify(hashes, receipt)).toEqual({ mode: 'web', backend: false });
    expect(classify(hashes, receipt, true)).toEqual({ mode: 'full', backend: true });
    expect(classify({ ...hashes, data: 'f'.repeat(64) }, receipt)).toEqual({ mode: 'full', backend: false });
    expect(classify({ ...hashes, backend: 'f'.repeat(64) }, receipt)).toEqual({ mode: 'web', backend: true });
    expect(classify({ ...hashes, hosting: 'f'.repeat(64) }, receipt).mode).toBe('full');
  });
  it.each(['data/new.json', 'scripts/omics/new-helper.ts', 'lib/new-helper.ts', 'services/omics/src/new.ts', 'package-lock.json', 'tsconfig.json'])(
    'includes generator dependency %s', name => expect(inputGroups(name).data).toBe(true),
  );
  it.each(['services/omics/firestore.rules', 'services/omics/firestore.indexes.json', 'services/omics/package-lock.json', 'firebase.json', 'scripts/contribution-deployment.mjs', '.github/workflows/firebase.yml'])(
    'includes backend dependency %s', name => expect(inputGroups(name).backend).toBe(true),
  );
  it('does not invalidate data for a UI-only change', () => {
    expect(inputGroups('components/header.tsx')).toEqual({ data: false, backend: false, hosting: false });
  });
  it('hashes tracked changes, additions, deletions and names, excluding generated outputs', async () => {
    const root = fixture(); file(root, 'data/input.json', 'one');
    const first = await fingerprints(root, {});
    file(root, 'workbench/private.json', 'secret', false);
    expect(await fingerprints(root, {})).toEqual(first);
    file(root, 'data/input.json', 'two', false);
    expect((await fingerprints(root, {})).data).not.toBe(first.data);
    file(root, 'data/input.json', 'one', false);
    file(root, 'data/new.json', 'extra');
    const added = await fingerprints(root, {}); expect(added.data).not.toBe(first.data);
    fs.unlinkSync(path.join(root, 'data/new.json'));
    expect((await fingerprints(root, {})).data).not.toBe(added.data);
    file(root, 'data/new.json', 'extra');
    execFileSync('git', ['mv', 'data/new.json', 'data/renamed.json'], { cwd: root });
    expect((await fingerprints(root, {})).data).not.toBe(added.data);
    expect((await fingerprints(root, { OMICS_MAIL_ENABLED: 'true' })).backend).not.toBe(first.backend);
    expect((await fingerprints(root, { SECRET_TOKEN: 'never included' })).backend).toBe(first.backend);
  });
  it('rejects symlinked inputs', async () => {
    const root = fixture(); file(root, 'data/input.json', 'one');
    fs.unlinkSync(path.join(root, 'data/input.json'));
    fs.symlinkSync('/etc/hosts', path.join(root, 'data/input.json'));
    await expect(fingerprints(root, {})).rejects.toThrow('regular file');
  });
});

describe('published metadata and output receipts', () => {
  it.each([new Response('', { status: 404 }), new Response('not JSON'), new Response(JSON.stringify({ ...receipt, schema: 2 })), new Response(' '.repeat(8193))])(
    'fails closed to full work for absent or invalid metadata', async response => {
      expect(await publishedReceipt({ fetchImpl: vi.fn(async () => response) })).toBeNull();
    },
  );
  it('requests the fixed origin without following redirects and excludes cached bytes', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(receipt)));
    expect(await publishedReceipt({ fetchImpl })).toEqual(receipt);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/rewire-it.web.app\/deployment.json\?verify=/), expect.objectContaining({ redirect: 'manual', headers: { 'Cache-Control': 'no-cache' } }));
  });
  it('rejects a changed receipt or manifest before publication', async () => {
    const bytes = Buffer.from('{"release_id":"test"}');
    const prior = { ...receipt, manifest_sha256: createHash('sha256').update(bytes).digest('hex') };
    const plan = { previous: prior };
    const fetchImpl = vi.fn(async (url: string) => new Response(url.includes('deployment.json') ? JSON.stringify(prior) : bytes));
    await expect(assertPublishedBase(plan, bytes, { fetchImpl })).resolves.toBeUndefined();
    await expect(assertPublishedBase(plan, Buffer.from('different'), { fetchImpl })).rejects.toThrow('catalogue differs');
    await expect(assertPublishedBase(plan, bytes, { fetchImpl: vi.fn(async () => new Response(JSON.stringify({ ...prior, commit: 'f'.repeat(40) }))) })).rejects.toThrow('build changed');
  });
  it('binds the receipt to generated bytes and refuses web mode on a changed release', async () => {
    const root = fixture();
    const bytes = JSON.stringify({ release_id: receipt.release_id });
    file(root, 'public/omics/manifest.json', bytes, false);
    file(root, 'workbench/deployment-plan.json', JSON.stringify({ ...receipt, mode: 'full', previous: receipt }), false);
    fs.mkdirSync(path.join(root, 'out'));
    const generated = await writeReceipt(root);
    expect(validReceipt(generated)).toBe(true);
    expect(generated.manifest_sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    file(root, 'workbench/deployment-plan.json', JSON.stringify({ ...receipt, mode: 'web', previous: receipt }), false);
    await expect(writeReceipt(root)).rejects.toThrow('differs from the published release');
  });
});
