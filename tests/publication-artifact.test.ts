import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { packPublication, verifyPublication, restorePublication } from '../scripts/publication-artifact.mjs';
import { assertPublicationBase, publicationDecision } from '../scripts/publication-preflight.mjs';
const roots: string[] = [];
const commit = 'a'.repeat(40);
const release_id = '2026-10-07-aaaaaaaaaaaa';
const fingerprints = {data: 'b'.repeat(64), backend: 'c'.repeat(64), hosting: 'd'.repeat(64), frontend: 'e'.repeat(64)};
const manifest = JSON.stringify({release_id});
const receipt = {schema: 3, producer_repository: 'rewire-bio/rewire-benchmark-data', producer_revision: '1'.repeat(40), producer_manifest_sha256: '2'.repeat(64),
  commit, frontend_version: commit, release_id, fingerprints, manifest_sha256: createHash('sha256').update(manifest).digest('hex')};
async function file(root: string, name: string, content: string) {
  await mkdir(path.dirname(path.join(root, name)), {recursive: true});
  await writeFile(path.join(root, name), content);
}
async function fixture(mode = 'web') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'publication-')); roots.push(root);
  await file(root, 'build/web/server.js', 'checked server');
  await file(root, 'build/web/.next/static/chunk.js', 'checked chunk');
  await file(root, 'public/omics/releases/huge.jsonl', 'historical data not transported');
  await file(root, 'public/omics/manifest.json', manifest);
  await file(root, 'public/omics/catalogue.json', '[]');
  await file(root, 'workbench/deployment-plan.json', JSON.stringify({mode, commit, fingerprints, previous: receipt}));
  await file(root, 'workbench/deployment-receipt.json', JSON.stringify(receipt));
  return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive:true, force:true}); });
describe('checked publication handoff', () => {
  it('transports the checked standalone frontend and current identity without downloads', async () => {
    const root = await fixture(); const stage = path.join(root, 'workbench/publication');
    await packPublication(root); const metadata = await verifyPublication(stage, commit);
    expect(metadata.files.some((file: {path: string}) => file.path.includes('huge.jsonl'))).toBe(false);
    const target = await mkdtemp(path.join(os.tmpdir(), 'restored-')); roots.push(target);
    await restorePublication(stage, target, commit);
    expect(await readFile(path.join(target, 'build/web/server.js'), 'utf8')).toBe('checked server');
    expect(await readFile(path.join(target, 'workbench/deployment-receipt.json'), 'utf8')).toBe(JSON.stringify(receipt));
  });
  it('rejects corrupted payloads and foreign source commits before restoring', async () => {
    const root = await fixture(); await packPublication(root); const stage = path.join(root, 'workbench/publication');
    await expect(verifyPublication(stage, 'f'.repeat(40))).rejects.toThrow('Invalid');
    await writeFile(path.join(stage, 'build/web/server.js'), 'tampered');
    await expect(verifyPublication(stage, commit)).rejects.toThrow('checksum');
  });
  it('rejects unexpected files, path traversal and symlinks, in the build too', async () => {
    const root = await fixture(); await packPublication(root); const stage = path.join(root, 'workbench/publication');
    await symlink('/etc/passwd', path.join(stage, 'private'));
    await expect(verifyPublication(stage, commit)).rejects.toThrow('symlinks');
    await rm(path.join(stage, 'private'));
    const metadata = JSON.parse(await readFile(path.join(stage, 'artifact.json'), 'utf8'));
    metadata.files.push({path: '../secret', bytes:0, sha256: 'a'.repeat(64)});
    await writeFile(path.join(stage, 'artifact.json'), JSON.stringify(metadata));
    await expect(verifyPublication(stage, commit)).rejects.toThrow('Unsafe');
    const linked = await fixture(); await symlink('/usr/lib', path.join(linked, 'build/web/node_modules'));
    await expect(packPublication(linked)).rejects.toThrow('symlinks');
  });
  it('requires the hydrated release to equal the checked one', async () => {
    const root = await fixture('full'); await packPublication(root); const stage = path.join(root, 'workbench/publication');
    const wrong = await fixture('full'); await file(wrong, 'public/omics/catalogue.json', '[1]');
    await expect(restorePublication(stage, wrong, commit)).rejects.toThrow('differs');
  });
});
describe('publication lock preflight', () => {
  it('supersedes old builds and rejects source identity mismatches', () => {
    expect(publicationDecision(commit, 'e'.repeat(40), {commit})).toEqual({publish:false, reason:'superseded'});
    expect(publicationDecision(commit, commit, {commit}).publish).toBe(true);
    expect(() => publicationDecision(commit, commit, {commit:'wrong'})).toThrow('identity');
  });
  it('allows an intervening UI publication only with identical catalogue and backend identity', async () => {
    const current = {...receipt, commit:'f'.repeat(40)};
    const plan = {mode:'web', backend:false, fingerprints, previous:receipt};
    const checked = await assertPublicationBase(plan, {receipt:async () => current,bytes:async () => Buffer.from(manifest)});
    expect(checked.previous).toEqual(current);
    expect(plan.previous).toEqual(receipt); // Early check does not mutate the artifact plan.
    for (const forbidden of [{mode:'full'}, {backend:true}, {force_full:true}]) {
      await expect(assertPublicationBase({...plan,...forbidden}, {receipt:async () => current, bytes:async () => Buffer.from(manifest)})).rejects.toThrow();
    }
    for (const changed of [{release_id:'2026-10-08-aaaaaaaaaaaa'}, {fingerprints:{...fingerprints, backend:'e'.repeat(64)}}, {fingerprints:{...fingerprints,data:'e'.repeat(64)}}]) {
      await expect(assertPublicationBase(plan, {receipt:async () => ({...current,...changed}), bytes:async () => Buffer.from(manifest)})).rejects.toThrow();
    }
  });
  it('checks live receipt and manifest before production writes', async () => {
    const bytes = async () => Buffer.from(manifest);
    await assertPublicationBase({previous:receipt}, {receipt: async () => receipt, bytes});
    await expect(assertPublicationBase({previous:receipt}, {receipt:async () => ({...receipt,commit:'f'.repeat(40)}),bytes})).rejects.toThrow('changed');
    await expect(assertPublicationBase({previous:receipt}, {receipt:async () => receipt,bytes:async () => Buffer.from('wrong')})).rejects.toThrow('manifest');
  });
});
