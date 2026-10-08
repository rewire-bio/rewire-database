import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { downloadLocations } from '../scripts/generate-download-locations.mjs';
import { githubDownloadUrl, optionalGithubDownloadUrl } from '../lib/downloads';
import { safeSourceUrl } from '../lib/omics';
import lock from '../benchmark-data.lock.json';

describe('GitHub downloads', () => {
  it('uses actual producer sources pinned to the scientific revision', () => {
    expect(githubDownloadUrl(`/omics/releases/${lock.release_id}/records.csv`)).toBe(`https://raw.githubusercontent.com/${lock.repository}/${lock.revision}/data/omics/releases/${lock.release_id}/records.csv.gz`);
    expect(githubDownloadUrl(`/omics/releases/${lock.release_id}/manifest.json`)).toContain(`/website/files/public/omics/releases/${lock.release_id}/manifest.json.gz`);
    expect(githubDownloadUrl('/benchmark-literature/results.csv')).toContain('/website/files/public/benchmark-literature/results.csv.gz');
  });
  it('refuses invented downloads and routes genuine source URLs through the inventory', () => {
    expect(() => githubDownloadUrl('/omics/releases/invented/records.csv')).toThrow('absent');
    expect(optionalGithubDownloadUrl('https://evil.example/omics/catalogue.json')).toBeUndefined();
    expect(safeSourceUrl('/omics/manifest.json')).toBe(githubDownloadUrl('/omics/manifest.json'));
    expect(safeSourceUrl('https://example.org/paper')).toBe('https://example.org/paper');
    expect(safeSourceUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeSourceUrl('https://')).toBeUndefined();
    expect(safeSourceUrl('https://benchmarks.rewire.it/omics/manifest.json')).toBe(githubDownloadUrl('/omics/manifest.json'));
    expect(safeSourceUrl('https://benchmarks.rewire.it/omics/missing.json')).toBeUndefined();
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
