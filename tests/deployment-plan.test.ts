import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { COMPILED_TAXONOMY, assertPublishedBase, classify, fingerprints, inputGroups, liveAcceptanceProfile, publishedReceipt, validReceipt, writeReceipt } from '../scripts/deployment-plan.mjs';

const roots: string[] = [];
const hashes = { data: 'a'.repeat(64), backend: 'b'.repeat(64), hosting: 'c'.repeat(64), frontend: '9'.repeat(64) };
const receipt = { schema: 4, producer_repository: 'rewire-bio/rewire-benchmark-data', producer_revision: '1'.repeat(40), commit: 'd'.repeat(40), fingerprints: hashes,
  frontend_version: '8'.repeat(40), producer_manifest_sha256: '2'.repeat(64), release_id: '2026-09-29-06401fd5b220', manifest_sha256: 'e'.repeat(64) };
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-plan-')); roots.push(root);
  execFileSync('git', ['init', '-q', root]);
  // Hydrated by data:prepare and ignored by Git, like the real checkout.
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, COMPILED_TAXONOMY), 'export const DOMAINS = [];');
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
    const all = { mode: 'full', backend: true, frontend: true, edge: true };
    expect(classify(hashes, null)).toEqual(all);
    expect(classify(hashes, { ...receipt, schema: 2 })).toEqual(all);
    expect(classify(hashes, receipt)).toEqual({ mode: 'web', backend: false, frontend: false, edge: false });
    expect(classify(hashes, receipt, true)).toEqual(all);
    expect(classify({ ...hashes, backend: 'f'.repeat(64) }, receipt)).toEqual({ mode: 'web', backend: true, frontend: false, edge: false });
    expect(classify({ ...hashes, hosting: 'f'.repeat(64) }, receipt)).toEqual({ mode: 'web', backend: false, frontend: false, edge: true });
  });
  it('builds a new image for a new data pin, because the image embeds the release', () => {
    expect(inputGroups('benchmark-data.lock.json')).toEqual({ data: true, backend: false, hosting: false, frontend: true });
    expect(classify({ ...hashes, data: 'f'.repeat(64), frontend: 'f'.repeat(64) }, receipt)).toEqual({ mode: 'full', backend: false, frontend: true, edge: false });
  });
  it.each(['app/page.tsx', 'lib/omics.ts', 'lib/record-pages.ts', 'package-lock.json', 'next.config.mjs', 'Dockerfile', 'scripts/server-entry.mjs'])(
    'rebuilds the image for image input %s', name => expect(inputGroups(name).frontend).toBe(true),
  );
  it.each(['cloudflare/worker.mjs', 'wrangler.jsonc', 'firebase.json'])('redeploys the Worker for %s', name => expect(inputGroups(name).hosting).toBe(true));
  it.each(['services/omics/src/store.ts', 'services/omics/src/published-catalogue.ts', 'services/omics/src/router.ts',
    'services/omics/src/functions.ts', 'services/omics/src/http-handler.ts', 'services/omics/src/mail-worker.ts', 'services/omics/src/auth.ts',
    'services/omics/src/outbox.ts', 'services/omics/package.json', 'services/omics/firestore.rules', 'services/omics/test/emulator.test.ts'])(
    'deploys backend-only change %s without building an image', name => {
      expect(inputGroups(name).frontend).toBe(false);
      expect(inputGroups(name).backend).toBe(name.startsWith('services/omics/test/') ? false : true);
    });
  it.each(['shared/omics/catalogue-query.ts', 'lib/record-pages.ts', 'shared/omics/use-cases.ts', 'shared/omics/entity-kinds.ts'])(
    'rebuilds only the image for shared code %s', name => expect(inputGroups(name)).toMatchObject({ backend: false, frontend: true }),
  );
  it('keeps frontend-only edits away from the backend deployment', () => {
    for (const name of ['app/page.tsx', 'lib/record-page.ts', 'middleware.ts', 'scripts/server-entry.mjs']) expect(inputGroups(name).backend).toBe(false);
  });
  it('keeps the website independent of the submission function', () => {
    // Follow static and dynamic relative/@ imports from the website's own sources.
    const seen = new Set<string>();
    const stack = ['middleware.ts', ...['app', 'lib', 'components'].flatMap(dir => fs.readdirSync(dir, { recursive: true })
      .map(file => path.join(dir, String(file))).filter(file => /\.(ts|tsx|mjs)$/.test(file)))];
    while (stack.length) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\(\s*)["']([^"']+)["']/g)) {
        const spec = match[1];
        if (!spec.startsWith('.') && !spec.startsWith('@/')) continue;
        const base = (spec.startsWith('@/') ? spec.slice(2) : path.join(path.dirname(file), spec)).replace(/\.js$/, '');
        const target = ['', '.ts', '.tsx', '.mjs'].map(ext => path.normalize(base + ext)).find(name => fs.existsSync(name) && fs.statSync(name).isFile());
        if (target) stack.push(target);
      }
    }
    expect([...seen].filter(name => name.startsWith('services/'))).toEqual([]);
    expect(seen.has('lib/record-pages.ts')).toBe(true);
  });
  it('builds a new image when the lock or the compiled taxonomy changes', async () => {
    const root = fixture(); file(root, 'benchmark-data.lock.json', 'one');
    const first = await fingerprints(root, {});
    file(root, 'benchmark-data.lock.json', 'two', false);
    const lock = await fingerprints(root, {});
    expect(lock.frontend).not.toBe(first.frontend);
    expect(lock.data).not.toBe(first.data);
    fs.writeFileSync(path.join(root, COMPILED_TAXONOMY), 'export const DOMAINS = ["changed"];');
    const taxonomy = await fingerprints(root, {});
    expect(taxonomy.frontend).not.toBe(lock.frontend);
    expect(taxonomy.data).toBe(lock.data);
  });
  it('refuses to plan before the compiled taxonomy is hydrated', async () => {
    const root = fixture(); fs.unlinkSync(path.join(root, COMPILED_TAXONOMY));
    await expect(fingerprints(root, {})).rejects.toThrow('data:prepare');
  });
  it.each(['data/new.json', 'scripts/omics/new-helper.ts', 'lib/new-helper.ts', 'services/omics/src/new.ts', 'package-lock.json', 'tsconfig.json'])(
    'does not invalidate pinned data for consumer dependency %s', name => expect(inputGroups(name).data).toBe(false),
  );
  it.each(['services/omics/firestore.rules', 'services/omics/firestore.indexes.json', 'services/omics/package-lock.json', 'firebase.json', 'scripts/contribution-deployment.mjs'])(
    'includes backend dependency %s', name => expect(inputGroups(name).backend).toBe(true),
  );
  it('does not redeploy the backend for a workflow-only edit', async () => {
    const root = fixture(); file(root, '.github/workflows/firebase.yml', 'first');
    const first = await fingerprints(root, {});
    file(root, '.github/workflows/firebase.yml', 'second', false);
    expect(await fingerprints(root, {})).toEqual(first);
    expect(inputGroups('.github/workflows/firebase.yml')).toEqual({ data: false, backend: false, hosting: false, frontend: false });
  });
  it('permits core acceptance only for a verified UI-only plan', () => {
    const plan = {mode: 'web', backend: false, fingerprints: hashes, previous: receipt};
    expect(liveAcceptanceProfile(plan)).toBe('core');
    for (const changed of [{mode: 'full'}, {backend: true}, {backend: undefined}, {previous: null}, {force_full: true}, {fingerprints: {...hashes, backend: 'f'.repeat(64)}}, {fingerprints: {...hashes, data: 'f'.repeat(64)}}]) {
      expect(liveAcceptanceProfile({...plan, ...changed})).toBe('full');
    }
  });
  it('binds data changes to the immutable producer lock', () => {
    expect(inputGroups('benchmark-data.lock.json').data).toBe(true);
  });
  it('does not invalidate data for a UI-only change', () => {
    expect(inputGroups('components/header.tsx')).toEqual({ data: false, backend: false, hosting: false, frontend: true });
  });
  it('hashes producer lock changes and deletion, ignoring local hydrated data', async () => {
    const root = fixture(); file(root, 'benchmark-data.lock.json', 'one');
    const first = await fingerprints(root, {});
    file(root, 'data/input.json', 'local fixture');
    file(root, 'workbench/private.json', 'secret', false);
    expect(await fingerprints(root, {})).toEqual(first);
    file(root, 'benchmark-data.lock.json', 'two', false);
    expect((await fingerprints(root, {})).data).not.toBe(first.data);
    fs.unlinkSync(path.join(root, 'benchmark-data.lock.json'));
    expect((await fingerprints(root, {})).data).not.toBe(first.data);
  });
  it('hashes backend additions, names, deletions and nonsecret configuration', async () => {
    const root = fixture(); file(root, 'services/omics/src/input.ts', 'one');
    const first = await fingerprints(root, {});
    file(root, 'services/omics/src/input.ts', 'two', false);
    expect((await fingerprints(root, {})).backend).not.toBe(first.backend);
    file(root, 'services/omics/src/input.ts', 'one', false);
    file(root, 'services/omics/src/new.ts', 'extra');
    const added = await fingerprints(root, {}); expect(added.backend).not.toBe(first.backend);
    fs.unlinkSync(path.join(root, 'services/omics/src/new.ts'));
    expect((await fingerprints(root, {})).backend).not.toBe(added.backend);
    file(root, 'services/omics/src/new.ts', 'extra');
    execFileSync('git', ['mv', 'services/omics/src/new.ts', 'services/omics/src/renamed.ts'], { cwd: root });
    expect((await fingerprints(root, {})).backend).not.toBe(added.backend);
    expect((await fingerprints(root, { OMICS_MAIL_ENABLED: 'true' })).backend).not.toBe(first.backend);
    expect((await fingerprints(root, { SECRET_TOKEN: 'never included' })).backend).toBe((await fingerprints(root, {})).backend);
  });
  it('rejects symlinked inputs', async () => {
    const root = fixture(); file(root, 'benchmark-data.lock.json', 'one');
    fs.unlinkSync(path.join(root, 'benchmark-data.lock.json'));
    fs.symlinkSync('/etc/hosts', path.join(root, 'benchmark-data.lock.json'));
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
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/benchmarks.rewirebio.io\/deployment.json\?verify=/), expect.objectContaining({ redirect: 'manual', headers: { 'Cache-Control': 'no-cache' } }));
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
  it('binds the receipt to the image, the data pin and generated bytes', async () => {
    const root = fixture();
    file(root, 'benchmark-data.lock.json', JSON.stringify({repository: receipt.producer_repository, revision: receipt.producer_revision,
      manifest_sha256: receipt.producer_manifest_sha256, release_id: receipt.release_id}));
    const bytes = JSON.stringify({ release_id: receipt.release_id });
    file(root, 'public/omics/manifest.json', bytes, false);
    file(root, 'workbench/deployment-plan.json', JSON.stringify({ ...receipt, mode: 'full', frontend: true, previous: receipt }), false);
    const generated = await writeReceipt(root);
    expect(validReceipt(generated)).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'workbench/deployment-receipt.json'), 'utf8'))).toEqual(generated);
    expect(generated.frontend_version).toBe(receipt.commit);
    expect(generated.producer_manifest_sha256).toBe(receipt.producer_manifest_sha256);
    expect(generated.manifest_sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    // A data-only adoption keeps serving the live image.
    file(root, 'workbench/deployment-plan.json', JSON.stringify({ ...receipt, mode: 'full', frontend: false, previous: receipt }), false);
    expect((await writeReceipt(root)).frontend_version).toBe(receipt.frontend_version);
    file(root, 'workbench/deployment-plan.json', JSON.stringify({ ...receipt, mode: 'web', previous: receipt }), false);
    await expect(writeReceipt(root)).rejects.toThrow('differs from the published release');
  });
});
