import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { downloadLocations, downloadUrls } from '../scripts/download-locations.mjs';
import { downloadHref, optionalDownloadHref } from '../lib/downloads';
import { safeSourceUrl } from '../lib/omics';
import lock from '../benchmark-data.lock.json';

describe('GitHub downloads', () => {
  it('redirects site paths to the exact producer sources of the pinned revision', () => {
    const urls = downloadUrls(downloadLocations(lock, fs.readFileSync('workbench/benchmark-data/website/manifest.json')));
    expect(urls.get(`/omics/releases/${lock.release_id}/records.jsonl`)).toBe(`https://raw.githubusercontent.com/${lock.repository}/${lock.revision}/data/omics/releases/${lock.release_id}/records.jsonl.gz`);
    expect(urls.get(`/omics/releases/${lock.release_id}/manifest.json`)).toContain(`/website/files/public/omics/releases/${lock.release_id}/manifest.json.gz`);
    expect(urls.get('/benchmark-literature/results.csv')).toContain('/website/files/public/benchmark-literature/results.csv.gz');
    expect(urls.has('/omics/releases/invented/records.csv')).toBe(false);
  });
  it('links our own download URLs as site paths, the same in server and browser renders', () => {
    expect(downloadHref(`/omics/releases/${lock.release_id}/records.jsonl`)).toBe(`/omics/releases/${lock.release_id}/records.jsonl`);
    expect(() => downloadHref('/database/model/x/')).toThrow('Not a published download');
    expect(() => downloadHref('/omics/../secret')).toThrow();
    expect(optionalDownloadHref('https://evil.example/omics/catalogue.json')).toBeUndefined();
    expect(safeSourceUrl('/omics/manifest.json')).toBe('/omics/manifest.json');
    expect(safeSourceUrl('https://example.org/paper')).toBe('https://example.org/paper');
    expect(safeSourceUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeSourceUrl('https://')).toBeUndefined();
    expect(safeSourceUrl('https://benchmarks.rewire.it/omics/manifest.json')).toBe('/omics/manifest.json');
  });
});

describe('download inventory generation', () => {
  const make = (files: unknown[]) => {
    const bytes = Buffer.from(JSON.stringify({ schema_version: 1, release_id: lock.release_id, files }));
    return { bytes, pin: { ...lock, manifest_sha256: crypto.createHash('sha256').update(bytes).digest('hex') } };
  };
  const entry = { destination: 'public/omics/releases/test/records.csv', source: 'data/omics/releases/test/records.csv.gz' };
  it('groups exact mappings without inventing release assets', () => {
    const { bytes, pin } = make([entry]);
    expect(downloadLocations(pin, bytes).groups).toEqual([{ destination: '/omics/releases/test', source: 'data/omics/releases/test', files: ['records.csv'] }]);
  });
  it('rejects unverified or mismatched manifests', () => {
    const { bytes, pin } = make([entry]);
    expect(() => downloadLocations(lock, bytes)).toThrow('digest');
    expect(() => downloadLocations({ ...pin, release_id: 'other' }, bytes)).toThrow('release');
  });
  it.each([
    { ...entry, destination: 'public/omics/../secret' },
    { ...entry, source: 'https://evil.example/file.csv.gz' },
    { ...entry, source: 'data/omics/releases/test/other.csv.gz' },
  ])('rejects unsafe source/destination mappings', (file) => {
    const { bytes, pin } = make([file]);
    expect(() => downloadLocations(pin, bytes)).toThrow();
  });
  it('rejects duplicate destinations', () => {
    const { bytes, pin } = make([entry, entry]);
    expect(() => downloadLocations(pin, bytes)).toThrow('Duplicate');
  });
});
