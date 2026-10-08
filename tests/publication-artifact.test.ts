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
const fingerprints = {data: 'b'.repeat(64), backend: 'c'.repeat(64), hosting: 'd'.repeat(64)};
const manifest = JSON.stringify({release_id});
const receipt = {schema: 2, producer_repository: 'rewire-bio/rewire-benchmark-data', producer_revision: '1'.repeat(40), commit, release_id, fingerprints, manifest_sha256: createHash('sha256').update(manifest).digest('hex')};
async function file(root: string, name: string, content: string) {
  await mkdir(path.dirname(path.join(root, name)), {recursive: true});
  await writeFile(path.join(root, name), content);
}
async function fixture(mode = 'web') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'publication-')); roots.push(root);
  await file(root, 'out/index.html', 'checked homepage');
  await file(root, 'out/404.html', 'checked missing');
  await file(root, 'out/deployment.json', JSON.stringify(receipt));
  await file(root, 'out/omics/releases/huge.jsonl', 'historical data not transported');
  await file(root, 'public/omics/manifest.json', manifest);
  await file(root, 'public/omics/catalogue.json', '[]');
  await file(root, 'workbench/deployment-plan.json', JSON.stringify({mode, commit, fingerprints, previous: receipt}));
  return root;
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, {recursive:true, force:true}); });
describe('checked publication handoff', () => {
  it('transports verified UI and current identity without historical downloads', async () => {
    const root = await fixture(); const stage = path.join(root, 'workbench/publication');
    await packPublication(root); const metadata = await verifyPublication(stage, commit);
    expect(metadata.files.some((file: {path: string}) => file.path.includes('huge.jsonl'))).toBe(false);
    const target = await mkdtemp(path.join(os.tmpdir(), 'restored-')); roots.push(target);
    await restorePublication(stage, target, commit);
    expect(await readFile(path.join(target, 'out/index.html'), 'utf8')).toBe('checked homepage');
    expect(await readFile(path.join(target, 'public/omics/manifest.json'), 'utf8')).toBe(manifest);
  });
  it('rejects corrupted payloads and foreign source commits before restoring', async () => {
    const root = await fixture(); await packPublication(root); const stage = path.join(root, 'workbench/publication');
    await expect(verifyPublication(stage, 'f'.repeat(40))).rejects.toThrow('Invalid');
    await writeFile(path.join(stage, 'out/index.html'), 'tampered');
    await expect(verifyPublication(stage, commit)).rejects.toThrow('checksum');
  });
  it('rejects unexpected files, path traversal and symlinks', async () => {
    const root = await fixture(); await packPublication(root); const stage = path.join(root, 'workbench/publication');
    await symlink('/etc/passwd', path.join(stage, 'private'));
    await expect(verifyPublication(stage, commit)).rejects.toThrow('symlinks');
    await rm(path.join(stage, 'private'));
    const metadata = JSON.parse(await readFile(path.join(stage, 'artifact.json'), 'utf8'));
    metadata.files.push({path: '../secret', bytes:0, sha256: 'a'.repeat(64)});
    await writeFile(path.join(stage, 'artifact.json'), JSON.stringify(metadata));
    await expect(verifyPublication(stage, commit)).rejects.toThrow('Unsafe');
  });
  it('requires identical hydrated data and preserves full historical exports', async () => {
    const root = await fixture('full'); await packPublication(root); const stage = path.join(root, 'workbench/publication');
    const target = await fixture('full'); await rm(path.join(target, 'out'), {recursive:true});
    await file(target, 'public/omics/releases/history.jsonl', 'immutable');
    await restorePublication(stage, target, commit);
    expect(await readFile(path.join(target, 'out/omics/releases/history.jsonl'), 'utf8')).toBe('immutable');
    const wrong = await fixture('full'); await file(wrong, 'public/omics/catalogue.json', '[1]');
    await expect(restorePublication(stage, wrong, commit)).rejects.toThrow('differs');
  });
  it('restores a changed-data frontend without transporting or restoring historical downloads', async () => {
    const root = await fixture('full'); await packPublication(root);
    const target = await fixture('full'); await rm(path.join(target, 'out'), {recursive:true});
    await file(target, 'public/omics/releases/history.jsonl', 'immutable');
    await restorePublication(path.join(root, 'workbench/publication'), target, commit, {frontendOnly:true});
    expect(await readFile(path.join(target, 'out/index.html'), 'utf8')).toBe('checked homepage');
    await expect(readFile(path.join(target, 'out/omics/releases/history.jsonl'))).rejects.toThrow();
    expect(await readFile(path.join(target, 'public/omics/releases/history.jsonl'), 'utf8')).toBe('immutable');
    const wrong = await fixture('full'); await rm(path.join(wrong, 'out'), {recursive:true});
    await file(wrong, 'public/omics/catalogue.json', '[1]');
    await expect(restorePublication(path.join(root, 'workbench/publication'), wrong, commit, {frontendOnly:true})).rejects.toThrow('differs');
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
