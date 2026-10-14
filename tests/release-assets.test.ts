import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { assetName, assetUrl, downloadVerifiedAsset, fetchVerifiedAsset, releaseHasAssets, usesReleaseAssets } from '../scripts/release-assets.mjs';
import { currentDataEntries, downloadCurrentData } from '../scripts/select-current-data.mjs';
import { lockFor, publishedAsAssets, useCasesOf } from '../scripts/adopt-data-release.mjs';
import { downloadLocations, downloadUrls } from '../scripts/download-locations.mjs';
import { pinnedDownloads } from '../scripts/github-downloads.mjs';

const release_id = '2026-10-15-aaaaaaaaaaaa';
const sha = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const content = {
  'public/omics/releases/2026-10-15-aaaaaaaaaaaa/records.jsonl': Buffer.from('{"id":"a"}\n'),
  'public/omics/releases/2026-10-15-aaaaaaaaaaaa/use-cases.json': Buffer.from('{"mappings":[{"id":"m","lifecycle":"active"}]}'),
  'lib/generated-benchmark-catalog.ts': Buffer.from('export const x = 1;\n'),
} as Record<string, Buffer>;
const sources: Record<string, string> = {
  'public/omics/releases/2026-10-15-aaaaaaaaaaaa/records.jsonl': 'data/omics/releases/2026-10-15-aaaaaaaaaaaa/records.jsonl.gz',
  'public/omics/releases/2026-10-15-aaaaaaaaaaaa/use-cases.json': 'data/omics/releases/2026-10-15-aaaaaaaaaaaa/use-cases.json.gz',
  'lib/generated-benchmark-catalog.ts': 'website/files/lib/generated-benchmark-catalog.ts.gz',
};
const entries = Object.entries(content).map(([destination, bytes]) => ({ source: sources[destination], destination, sha256: sha(bytes), bytes: bytes.length, scope: 'current' }));
const manifest = Buffer.from(JSON.stringify({ schema_version: 1, release_id, files: entries }));
const lock = {
  schema_version: 1, repository: 'rewire-bio/rewire-benchmark-data', revision: 'a'.repeat(40), manifest_sha256: sha(manifest), release_id,
  serving: { tag: `serving/${release_id}`, file: `catalogue-${release_id}.sqlite`, sha256: 'f'.repeat(64), website_assets: true },
};
const base = `https://github.com/rewire-bio/rewire-benchmark-data/releases/download/serving/${release_id}/`;

/** A GitHub release that serves each asset by name; `override` replaces one asset's bytes. */
function releaseServer(override: Record<string, Buffer> = {}) {
  const requested: string[] = [];
  const fetchImpl = vi.fn(async (url: string) => {
    requested.push(url);
    if (!url.startsWith(base)) return new Response('not found', { status: 404 });
    const name = url.slice(base.length);
    if (override[name]) return new Response(override[name]);
    const destination = Object.keys(content).find(key => assetName(key) === name);
    return destination ? new Response(gzipSync(content[destination])) : new Response('not found', { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requested };
}

describe('release asset names', () => {
  it('maps a manifest destination to one flat asset name and URL', () => {
    expect(assetName('public/omics/releases/x/records.jsonl')).toBe('public.omics.releases.x.records.jsonl.gz');
    expect(assetUrl(lock, 'lib/generated-benchmark-catalog.ts')).toBe(`${base}lib.generated-benchmark-catalog.ts.gz`);
    for (const unsafe of ['../secret', 'a//b', '/abs', 'a/./b', 'a b', 'a\nb']) expect(() => assetName(unsafe)).toThrow('Unsafe');
  });
  it('tells releases with every asset from older releases without any, and refuses a partial set', () => {
    const names = entries.map(entry => assetName(entry.destination));
    expect(releaseHasAssets([...names, `catalogue-${release_id}.sqlite`], entries)).toBe(true);
    expect(releaseHasAssets([`catalogue-${release_id}.sqlite`, `catalogue-${release_id}.json`], entries)).toBe(false);
    expect(() => releaseHasAssets(names.slice(1), entries)).toThrow('incomplete');
    expect(() => releaseHasAssets(names, [entries[0], { ...entries[0] }])).toThrow('Two manifest entries');
  });
  it('reads the flag from the lock only', () => {
    expect(usesReleaseAssets(lock)).toBe(true);
    expect(usesReleaseAssets({ ...lock, serving: { ...lock.serving, website_assets: undefined } })).toBe(false);
  });
});

describe('downloading release assets', () => {
  it('keeps an asset whose expanded bytes match the manifest entry', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-'));
    try {
      const { fetchImpl } = releaseServer();
      const target = path.join(dir, 'nested/records.jsonl.gz');
      await downloadVerifiedAsset(lock, entries[0], target, { fetchImpl });
      expect(fs.readdirSync(path.dirname(target))).toEqual(['records.jsonl.gz']);
      expect((await fetchVerifiedAsset(lock, entries[1], { fetchImpl })).toString()).toContain('"m"');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('refuses altered, truncated or missing assets and leaves nothing behind', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-'));
    try {
      const name = assetName(entries[0].destination);
      for (const override of [{ [name]: gzipSync(Buffer.from('{"id":"b"}\n')) }, { [name]: gzipSync(Buffer.from('{"id"')) }]) {
        const { fetchImpl } = releaseServer(override);
        await expect(downloadVerifiedAsset(lock, entries[0], path.join(dir, 'x.gz'), { fetchImpl })).rejects.toThrow('differs from the pinned manifest');
        await expect(fetchVerifiedAsset(lock, entries[0], { fetchImpl })).rejects.toThrow('differs from the pinned manifest');
      }
      const { fetchImpl } = releaseServer();
      await expect(downloadVerifiedAsset({ ...lock, serving: { ...lock.serving, tag: 'serving/other' } }, entries[0], path.join(dir, 'x.gz'), { fetchImpl })).rejects.toThrow('unavailable (404)');
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('current data from release assets', () => {
  it('writes each current file to its manifest source path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'current-'));
    try {
      const { fetchImpl, requested } = releaseServer();
      expect(await downloadCurrentData(lock, manifest, dir, { fetchImpl })).toBe(3);
      for (const entry of entries) expect(fs.existsSync(path.join(dir, entry.source))).toBe(true);
      expect(requested.every(url => url.startsWith(base))).toBe(true);
      // A second run replaces the files rather than trusting them.
      fs.writeFileSync(path.join(dir, entries[0].source), 'stale');
      await downloadCurrentData(lock, manifest, dir, { fetchImpl });
      expect(fs.readFileSync(path.join(dir, entries[0].source)).equals(gzipSync(content[entries[0].destination]))).toBe(true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('refuses an unauthenticated manifest and a release read from Git', async () => {
    const { fetchImpl } = releaseServer();
    await expect(downloadCurrentData(lock, Buffer.concat([manifest, Buffer.from(' ')]), os.tmpdir(), { fetchImpl })).rejects.toThrow('SHA-256');
    const gitLock = { ...lock, serving: { ...lock.serving, website_assets: undefined } };
    await expect(downloadCurrentData(gitLock, manifest, os.tmpdir(), { fetchImpl })).rejects.toThrow('read from Git');
    expect(currentDataEntries(gitLock, manifest)).toHaveLength(3);
  });
});

describe('adoption of a release published as assets', () => {
  const receipt = { release_id, file: `catalogue-${release_id}.sqlite`, sha256: 'f'.repeat(64) };
  it('pins website_assets only when the release carries every current file', () => {
    const names = entries.map(entry => assetName(entry.destination));
    const assets = publishedAsAssets(manifest, names);
    expect(lockFor(lock, { releaseId: release_id, revision: lock.revision, manifest, receipt, assets }).serving).toEqual({ tag: `serving/${release_id}`, file: receipt.file, sha256: receipt.sha256, website_assets: true });
    expect(lockFor(lock, { releaseId: release_id, revision: lock.revision, manifest, receipt, assets: publishedAsAssets(manifest, [receipt.file]) }).serving.website_assets).toBeUndefined();
  });
  it('reads use cases from the verified asset, or from Git for an older release', async () => {
    const { fetchImpl } = releaseServer();
    const show = vi.fn((_producer: string, object: string) => {
      if (object === `${lock.revision}:website/manifest.json`) return manifest;
      if (object === `${'b'.repeat(40)}:data/omics/releases/2026-10-01-bbbbbbbbbbbb/use-cases.json.gz`) return gzipSync(Buffer.from('{"mappings":[]}'));
      throw new Error(`missing ${object}`);
    });
    expect(await useCasesOf('producer', lock, { fetchImpl, show })).toEqual({ mappings: [{ id: 'm', lifecycle: 'active' }] });
    const older = { ...lock, revision: 'b'.repeat(40), release_id: '2026-10-01-bbbbbbbbbbbb', serving: { ...lock.serving, website_assets: undefined } };
    expect(await useCasesOf('producer', older, { fetchImpl, show })).toEqual({ mappings: [] });
    expect(await useCasesOf('producer', { ...older, revision: 'c'.repeat(40) }, { fetchImpl, show })).toBeNull();
  });
  it('fails rather than skipping the check when the asset or manifest is wrong', async () => {
    const show = () => manifest;
    const tampered = releaseServer({ [assetName(entries[1].destination)]: gzipSync(Buffer.from('{"mappings":[]}')) });
    await expect(useCasesOf('producer', lock, { fetchImpl: tampered.fetchImpl, show })).rejects.toThrow('differs from the pinned manifest');
    await expect(useCasesOf('producer', { ...lock, manifest_sha256: '0'.repeat(64) }, { fetchImpl: releaseServer().fetchImpl, show })).rejects.toThrow('differs from the pin');
  });
});

describe('downloads of a release published as assets', () => {
  it('redirect to the release asset, and the live checks expect the same URL', async () => {
    const locations = downloadLocations(lock, manifest);
    expect(locations.release_tag).toBe(`serving/${release_id}`);
    const urls = downloadUrls(locations);
    expect(urls.get(`/omics/releases/${release_id}/records.jsonl`)).toBe(`${base}public.omics.releases.${release_id}.records.jsonl.gz`);
    const files: Record<string, string> = { 'benchmark-data.lock.json': JSON.stringify(lock), 'generated-download-locations.json': JSON.stringify(locations) };
    const read = async (url: URL) => files[path.basename(url.pathname)];
    expect((await pinnedDownloads(read as never)).urls).toEqual(urls);
    // The location must say whether it reads assets, as the lock does.
    const { release_tag: _, ...withoutTag } = locations;
    files['generated-download-locations.json'] = JSON.stringify(withoutTag);
    await expect(pinnedDownloads(read as never)).rejects.toThrow('match the lock');
  });
});

