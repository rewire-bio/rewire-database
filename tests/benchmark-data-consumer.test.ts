import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  prepareBenchmarkData,
  isAllowedDestination,
  verifyLock,
  isTrackedByGit,
} from '../scripts/prepare-benchmark-data.mjs';
// Self-contained artifact fixture: website tests must not require a sibling checkout.
async function packageWebsite({ dataDir }: { dataDir: string }) {
  const releaseId = JSON.parse(fs.readFileSync(path.join(dataDir, 'public/omics/manifest.json'), 'utf8')).release_id;
  const files: Array<{ source: string; destination: string; bytes: number; sha256: string; scope: string }> = [];
  const visit = (relative: string) => {
    const sourcePath = path.join(dataDir, relative);
    if (fs.statSync(sourcePath).isDirectory()) {
      for (const name of fs.readdirSync(sourcePath)) visit(`${relative}/${name}`);
      return;
    }
    const destination = relative === 'lib/benchmark-catalog.ts' ? 'lib/generated-benchmark-catalog.ts' : relative;
    const source = `website/files/${destination}.gz`;
    const content = fs.readFileSync(sourcePath);
    fs.mkdirSync(path.dirname(path.join(dataDir, source)), { recursive: true });
    fs.writeFileSync(path.join(dataDir, source), zlib.gzipSync(content));
    files.push({ source, destination, bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex'), scope: destination.startsWith('public/omics/releases/') && destination.split('/')[3] !== releaseId ? 'historical' : 'current' });
  };
  for (const relative of ['public', 'data', 'lib/benchmark-catalog.ts']) visit(relative);
  files.sort((a, b) => a.destination.localeCompare(b.destination));
  const manifest = { schema_version: 1, release_id: releaseId, files };
  fs.writeFileSync(path.join(dataDir, 'website/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { manifest };
}

const tempRoots: string[] = [];

function createFixtureWorkspace() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rewire-consumer-test-'));
  tempRoots.push(tmpRoot);
  const dataDir = path.join(tmpRoot, 'data-repo');
  const websiteDir = path.join(tmpRoot, 'website-root');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(websiteDir, { recursive: true });
  fs.mkdirSync(path.join(websiteDir, 'workbench'), { recursive: true });
  fs.writeFileSync(path.join(websiteDir, 'workbench', 'keep-me.txt'), 'unrelated workbench data');

  const releaseId = '2026-09-29-06401fd5b220';

  // Producer files in dataDir
  const omicsReleasesDir = path.join(dataDir, 'public', 'omics', 'releases');
  fs.mkdirSync(path.join(omicsReleasesDir, releaseId), { recursive: true });
  fs.mkdirSync(path.join(omicsReleasesDir, '2026-09-25-8af07e960e5f'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'public', 'omics', 'sources'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'public', 'benchmark-literature'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'data', 'benchmark-literature'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'data', 'benchmark-runs'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'data', 'omics', 'releases'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'lib'), { recursive: true });

  fs.writeFileSync(
    path.join(dataDir, 'public', 'omics', 'manifest.json'),
    JSON.stringify({ schema_version: '1.1', release_id: releaseId }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'public', 'omics', 'catalogue.json'),
    JSON.stringify({ release_id: releaseId, records: [] }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(omicsReleasesDir, releaseId, 'catalogue.json'),
    JSON.stringify({ release_id: releaseId, current: true }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(omicsReleasesDir, '2026-09-25-8af07e960e5f', 'catalogue.json'),
    JSON.stringify({ release_id: '2026-09-25-8af07e960e5f', historical: true }, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'public', 'omics', 'sources', 'notes.txt'),
    'use-case sources content\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'public', 'benchmark-literature', 'papers.json'),
    JSON.stringify([{ id: 'p1' }]) + '\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'data', 'benchmark-literature', 'papers.json'),
    JSON.stringify([{ id: 'p1', raw: true }]) + '\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'data', 'benchmark-literature', 'results.csv'),
    'id,score\n1,0.99\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'data', 'benchmark-runs', 'mfass-v2.json'),
    JSON.stringify({ runs: [] }) + '\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'data', 'omics', 'scope-audit.jsonl'),
    '{"audit":true}\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'data', 'omics', 'releases', '2026-09-16-b5213be10a49.json'),
    JSON.stringify({ receipt: 'old' }) + '\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'data', 'omics', 'releases', `${releaseId}.json`),
    JSON.stringify({ receipt: releaseId }) + '\n',
  );
  fs.writeFileSync(
    path.join(dataDir, 'lib', 'benchmark-catalog.ts'),
    'export const CATALOG = [];\n',
  );

  const catalogue = fs.readFileSync(path.join(dataDir, 'public/omics/catalogue.json'));
  fs.writeFileSync(path.join(omicsReleasesDir, releaseId, 'catalogue.json'), catalogue);
  const catalogueSha = crypto.createHash('sha256').update(catalogue).digest('hex');
  const releaseManifest = JSON.stringify({ release_id: releaseId, catalogue_sha256: catalogueSha, files: { 'catalogue.json': catalogueSha } }) + '\n';
  for (const relative of ['public/omics/manifest.json', `public/omics/releases/${releaseId}/manifest.json`, `data/omics/releases/${releaseId}.json`]) {
    fs.writeFileSync(path.join(dataDir, relative), releaseManifest);
  }
  fs.copyFileSync(path.join(dataDir, 'data/benchmark-literature/results.csv'), path.join(dataDir, 'public/benchmark-literature/results.csv'));
  // Historical receipts retain a complete, immutable manifest and its files.
  for (const historicalId of ['2026-09-25-8af07e960e5f', '2026-09-16-b5213be10a49']) {
    const releaseDir = path.join(omicsReleasesDir, historicalId);
    fs.mkdirSync(releaseDir, { recursive: true });
    const historicalCatalogue = JSON.stringify({ release_id: historicalId, records: [] }) + '\n';
    fs.writeFileSync(path.join(releaseDir, 'catalogue.json'), historicalCatalogue);
    const digest = crypto.createHash('sha256').update(historicalCatalogue).digest('hex');
    const historicalManifest = JSON.stringify({ release_id: historicalId, catalogue_sha256: digest, files: { 'catalogue.json': digest } }) + '\n';
    fs.writeFileSync(path.join(releaseDir, 'manifest.json'), historicalManifest);
    fs.writeFileSync(path.join(dataDir, `data/omics/releases/${historicalId}.json`), historicalManifest);
  }

  return { tmpRoot, dataDir, websiteDir, releaseId };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {}
  }
});

describe('destination whitelist', () => {
  it('strictly allows only authorized destinations', () => {
    expect(isAllowedDestination('public/omics/manifest.json')).toBe(true);
    expect(isAllowedDestination('public/omics/catalogue.json')).toBe(true);
    expect(isAllowedDestination('public/omics/releases/2026-09-29-06401fd5b220/catalogue.json')).toBe(true);
    expect(isAllowedDestination('public/omics/sources/note.txt')).toBe(true);
    expect(isAllowedDestination('public/benchmark-literature/papers.json')).toBe(true);
    expect(isAllowedDestination('data/benchmark-literature/papers.json')).toBe(true);
    expect(isAllowedDestination('data/benchmark-literature/results.csv')).toBe(true);
    expect(isAllowedDestination('data/benchmark-runs/mfass-v2.json')).toBe(true);
    expect(isAllowedDestination('data/omics/scope-audit.jsonl')).toBe(true);
    expect(isAllowedDestination('data/omics/releases/2026-09-16-b5213be10a49.json')).toBe(true);
    expect(isAllowedDestination('lib/generated-benchmark-catalog.ts')).toBe(true);

    // Disallowed paths
    expect(isAllowedDestination('lib/benchmark-catalog.ts')).toBe(false);
    expect(isAllowedDestination('package.json')).toBe(false);
    expect(isAllowedDestination('app/page.tsx')).toBe(false);
    expect(isAllowedDestination('data/omics/migrated.jsonl')).toBe(false);
    expect(isAllowedDestination('data/omics/releases/sub/extra.json')).toBe(false);
    expect(isAllowedDestination('../outside.txt')).toBe(false);
    expect(isAllowedDestination('/absolute/path')).toBe(false);
    expect(isAllowedDestination('public/omics/../../escape')).toBe(false);
  });
});

describe('lock and manifest validation', () => {
  it('rejects missing or malformed lock file', () => {
    expect(() => verifyLock(null)).toThrow(/expected JSON object/);
    expect(() => verifyLock({ schema_version: 2 })).toThrow(/Unsupported lock schema_version/);
    expect(() => verifyLock({ schema_version: 1, repository: 'other/repo' })).toThrow(/Invalid lock repository/);
    expect(() => verifyLock({
      schema_version: 1,
      repository: 'rewire-bio/rewire-benchmark-data',
      revision: 'not-40-hex',
      manifest_sha256: 'a'.repeat(64),
      release_id: 'rel-1',
    })).toThrow(/Invalid lock revision/);
    expect(() => verifyLock({
      schema_version: 1,
      repository: 'rewire-bio/rewire-benchmark-data',
      revision: 'a'.repeat(40),
      manifest_sha256: 'bad-sha',
      release_id: 'rel-1',
    })).toThrow(/Invalid lock manifest_sha256/);
    expect(() => verifyLock({
      schema_version: 1,
      repository: 'rewire-bio/rewire-benchmark-data',
      revision: 'a'.repeat(40),
      manifest_sha256: 'a'.repeat(64),
      release_id: '',
    })).toThrow(/Invalid lock release_id/);
  });

  it('rejects missing source directory and advises running npm run data:fetch', async () => {
    const { websiteDir } = createFixtureWorkspace();
    const missingSource = path.join(websiteDir, 'nonexistent-source');
    await expect(
      prepareBenchmarkData({ source: missingSource, websiteRoot: websiteDir }),
    ).rejects.toThrow(/Run "npm run data:fetch"/);
  });

  it('rejects malformed manifest JSON or schema', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');

    // Case 1: Corrupted JSON syntax
    fs.writeFileSync(manifestPath, '{ not json }');
    const badJsonSha = crypto.createHash('sha256').update('{ not json }').digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: badJsonSha,
        release_id: releaseId,
      }),
    );
    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/invalid JSON/i);

    // Case 2: Bad schema_version
    const badSchema = JSON.stringify({ schema_version: 2, release_id: releaseId, files: [] }, null, 2) + '\n';
    fs.writeFileSync(manifestPath, badSchema);
    const badSchemaSha = crypto.createHash('sha256').update(badSchema).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: badSchemaSha,
        release_id: releaseId,
      }),
    );
    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/schema_version/i);
  });
});

describe('git revision verification', () => {
  it('enforces matching git HEAD revision in standard mode', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1111111111111111111111111111111111111111',
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    // Mismatched revision
    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '2222222222222222222222222222222222222222',
      }),
    ).rejects.toThrow(/revision mismatch/i);

    // Matching revision succeeds
    const result = await prepareBenchmarkData({
      source: dataDir,
      websiteRoot: websiteDir,
      getHeadRevision: () => '1111111111111111111111111111111111111111',
    });
    expect(result.release_id).toBe(releaseId);
  });

  it('allows uncommitted override ONLY when CI is not set', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1111111111111111111111111111111111111111',
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    const origEnv = { ...process.env };
    try {
      delete process.env.CI;
      process.env.BENCHMARK_DATA_ALLOW_UNCOMMITTED = '1';

      // Succeeds locally with warning
      const res = await prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '9999999999999999999999999999999999999999',
      });
      expect(res.release_id).toBe(releaseId);

      // Fails when CI is set, even if BENCHMARK_DATA_ALLOW_UNCOMMITTED=1
      process.env.CI = 'true';
      await expect(
        prepareBenchmarkData({
          source: dataDir,
          websiteRoot: websiteDir,
          getHeadRevision: () => '9999999999999999999999999999999999999999',
        }),
      ).rejects.toThrow(/revision mismatch/i);
    } finally {
      process.env = origEnv;
    }
  });

  it('works with a real git repository created via git init', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    execSync('git init -b main', { cwd: dataDir });
    execSync('git config user.name "Tester"', { cwd: dataDir });
    execSync('git config user.email "test@example.com"', { cwd: dataDir });
    execSync('git add .', { cwd: dataDir });
    execSync('git commit -m "initial package"', { cwd: dataDir });
    const realHead = execSync('git rev-parse HEAD', { cwd: dataDir }).toString().trim();

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: realHead,
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    const result = await prepareBenchmarkData({
      source: dataDir,
      websiteRoot: websiteDir,
    });
    expect(result.release_id).toBe(releaseId);
  });
});

describe('SHA corruption handling', () => {
  it('rejects manifest SHA corruption', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: 'f'.repeat(64), // Corrupted sha
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Manifest SHA-256 mismatch/);
  });

  it('rejects file payload SHA corruption', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Corrupt sha256 of the first file entry
    manifest.files[0].sha256 = 'e'.repeat(64);
    const rawManifest = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(manifestPath, rawManifest);

    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Payload SHA-256 mismatch/);
  });

  it('rejects file payload size mismatch', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Corrupt bytes count of the first file entry
    manifest.files[0].bytes = manifest.files[0].bytes + 999;
    const rawManifest = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(manifestPath, rawManifest);

    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Payload size mismatch/);
  });

  it('rejects corrupted gzip source payload', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const firstSource = path.join(dataDir, manifest.files[0].source);
    // Write corrupt binary garbage to the gzip file
    fs.writeFileSync(firstSource, Buffer.from([0x1f, 0x8b, 0x00, 0xff, 0xde, 0xad, 0xbe, 0xef]));

    const rawManifest = fs.readFileSync(manifestPath);
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Corrupted gzip stream/);
  });
});

describe('traversal, symlinks, and duplicate protections', () => {
  it('rejects traversal in destination', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].destination = 'public/omics/../../escaped.json';
    const rawManifest = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(manifestPath, rawManifest);

    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/traversal/i);
  });

  it('rejects traversal in source', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].source = 'website/files/../../outside.gz';
    const rawManifest = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(manifestPath, rawManifest);

    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/traversal/i);
  });

  it('rejects absolute paths in destination or source', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].destination = '/tmp/absolute.json';
    const rawManifest = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(manifestPath, rawManifest);

    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Absolute destination path rejected/);
  });

  it('rejects forbidden non-whitelisted destinations', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].destination = 'package.json';
    const rawManifest = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(manifestPath, rawManifest);

    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Forbidden destination path/);
  });

  it('rejects symlinks in source outputs', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const targetSource = path.join(dataDir, manifest.files[0].source);

    // Replace the real file with a symlink to another file
    const realFile = path.join(dataDir, manifest.files[1].source);
    fs.unlinkSync(targetSource);
    fs.symlinkSync(realFile, targetSource);

    const rawManifest = fs.readFileSync(manifestPath);
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/symlink/i);
  });

  it('rejects duplicate destinations or duplicate sources', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const manifestPath = path.join(dataDir, 'website', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files.push({ ...manifest.files[0] });
    const rawManifest = JSON.stringify(manifest, null, 2) + '\n';
    fs.writeFileSync(manifestPath, rawManifest);

    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/duplicate destination/i);
  });
});

describe('scope filtering: --current-only', () => {
  it('skips historical public outputs while hydrating current release and all receipts', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    const res = await prepareBenchmarkData({
      source: dataDir,
      websiteRoot: websiteDir,
      currentOnly: true,
      getHeadRevision: () => '1'.repeat(40),
    });

    expect(res.skippedCount).toBeGreaterThan(0);

    // Current release hydrated
    expect(fs.existsSync(path.join(websiteDir, 'public', 'omics', 'releases', releaseId, 'catalogue.json'))).toBe(true);
    // Historical public release skipped
    expect(fs.existsSync(path.join(websiteDir, 'public', 'omics', 'releases', '2026-09-25-8af07e960e5f', 'catalogue.json'))).toBe(false);
    // Receipts hydrated
    expect(fs.existsSync(path.join(websiteDir, 'data', 'omics', 'releases', '2026-09-16-b5213be10a49.json'))).toBe(true);
    expect(fs.existsSync(path.join(websiteDir, 'data', 'omics', 'releases', `${releaseId}.json`))).toBe(true);
    // Pointers hydrated
    expect(fs.existsSync(path.join(websiteDir, 'public', 'omics', 'manifest.json'))).toBe(true);
    // Generated catalog hydrated
    expect(fs.existsSync(path.join(websiteDir, 'lib', 'generated-benchmark-catalog.ts'))).toBe(true);
  });

  it('hydrates full historical public releases when --current-only is false', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    const res = await prepareBenchmarkData({
      source: dataDir,
      websiteRoot: websiteDir,
      currentOnly: false,
      getHeadRevision: () => '1'.repeat(40),
    });

    expect(res.skippedCount).toBe(0);
    expect(fs.existsSync(path.join(websiteDir, 'public', 'omics', 'releases', '2026-09-25-8af07e960e5f', 'catalogue.json'))).toBe(true);
  });
});

describe('immutable conflict and pointer validation', () => {
  it('refuses to overwrite conflicting immutable release files', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    // Pre-create conflicting immutable file in website destination
    const immutableTarget = path.join(
      websiteDir,
      'public',
      'omics',
      'releases',
      releaseId,
      'catalogue.json',
    );
    fs.mkdirSync(path.dirname(immutableTarget), { recursive: true });
    fs.writeFileSync(immutableTarget, 'DIFFERENT_IMMUTABLE_CONTENT');

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Refusing to overwrite conflicting immutable release file/);

    // Conflicting file remains untouched
    expect(fs.readFileSync(immutableTarget, 'utf8')).toBe('DIFFERENT_IMMUTABLE_CONTENT');
  });

  it('refuses stale unexpected current pointer when manifest release_id differs from lock', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    // Lock pins a different release_id
    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: '2026-09-28-111111111111',
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/release_id mismatch/);
  });

  it('refuses stale pointer when catalogue.json has mismatched release_id', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();

    // Modify catalogue.json in data repo to have stale release_id
    fs.writeFileSync(
      path.join(dataDir, 'public', 'omics', 'catalogue.json'),
      JSON.stringify({ release_id: 'stale-id', records: [] }) + '\n',
    );
    fs.copyFileSync(path.join(dataDir, 'public/omics/catalogue.json'), path.join(dataDir, `public/omics/releases/${releaseId}/catalogue.json`));
    await packageWebsite({ dataDir });

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    await expect(
      prepareBenchmarkData({
        source: dataDir,
        websiteRoot: websiteDir,
        getHeadRevision: () => '1'.repeat(40),
      }),
    ).rejects.toThrow(/Stale current pointer/);
  });
});

describe('idempotent rerun and workbench hygiene', () => {
  it('supports rerunning idempotently and preserves unrelated workbench data', async () => {
    const { dataDir, websiteDir, releaseId } = createFixtureWorkspace();
    await packageWebsite({ dataDir });

    const rawManifest = fs.readFileSync(path.join(dataDir, 'website', 'manifest.json'));
    const manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');

    fs.writeFileSync(
      path.join(websiteDir, 'benchmark-data.lock.json'),
      JSON.stringify({
        schema_version: 1,
        repository: 'rewire-bio/rewire-benchmark-data',
        revision: '1'.repeat(40),
        manifest_sha256: manifestSha,
        release_id: releaseId,
      }),
    );

    // First run hydrates files
    const run1 = await prepareBenchmarkData({
      source: dataDir,
      websiteRoot: websiteDir,
      getHeadRevision: () => '1'.repeat(40),
    });
    expect(run1.hydratedCount).toBeGreaterThan(0);

    // Unrelated workbench data preserved
    expect(fs.readFileSync(path.join(websiteDir, 'workbench', 'keep-me.txt'), 'utf8')).toBe(
      'unrelated workbench data',
    );

    // Second run reuses files without error
    const run2 = await prepareBenchmarkData({
      source: dataDir,
      websiteRoot: websiteDir,
      getHeadRevision: () => '1'.repeat(40),
    });
    expect(run2.reusedCount).toBeGreaterThan(0);
    expect(run2.hydratedCount).toBe(0);

    // No leftover temporary staging dirs in workbench
    const workbenchEntries = fs.readdirSync(path.join(websiteDir, 'workbench'));
    expect(workbenchEntries.filter((e) => e.startsWith('.staging-'))).toHaveLength(0);
    expect(fs.readFileSync(path.join(websiteDir, 'workbench', 'keep-me.txt'), 'utf8')).toBe(
      'unrelated workbench data',
    );
  });
});

describe('no production of data', () => {
  it('consumer never imports or calls data generation scripts', () => {
    const consumerSource = fs.readFileSync(
      path.join(__dirname, '../scripts/prepare-benchmark-data.mjs'),
      'utf8',
    );

    // Must not import data generation modules
    expect(consumerSource).not.toMatch(/from\s+['"][^'"]*scripts\/omics/);
    expect(consumerSource).not.toMatch(/from\s+['"][^'"]*services\/omics/);
    expect(consumerSource).not.toMatch(/buildRelease/);
    expect(consumerSource).not.toMatch(/writeArchive/);
    expect(consumerSource).not.toMatch(/packageWebsite/);
  });
});


describe('pinned artifact boundary regressions', () => {
  async function fixture() {
    const value = createFixtureWorkspace();
    const { manifest } = await packageWebsite(value);
    const pin = () => {
      const content = JSON.stringify(manifest);
      fs.writeFileSync(path.join(value.dataDir, 'website/manifest.json'), content);
      fs.writeFileSync(path.join(value.websiteDir, 'benchmark-data.lock.json'), JSON.stringify({
        schema_version: 1, repository: 'rewire-bio/rewire-benchmark-data', revision: '1'.repeat(40),
        manifest_sha256: crypto.createHash('sha256').update(content).digest('hex'), release_id: value.releaseId,
      }));
    };
    pin();
    const hydrate = (currentOnly = false) => prepareBenchmarkData({ source: value.dataDir, websiteRoot: value.websiteDir, getHeadRevision: () => '1'.repeat(40), currentOnly });
    return { ...value, manifest, pin, hydrate };
  }

  it.each(['destination ancestor', 'destination leaf', 'source ancestor', 'workbench'])('rejects %s symlinks before writes', async (kind) => {
    const f = await fixture();
    const outside = path.join(f.tmpRoot, 'outside');
    fs.mkdirSync(outside);
    if (kind === 'destination ancestor') {
      fs.mkdirSync(path.join(f.websiteDir, 'public'));
      fs.symlinkSync(outside, path.join(f.websiteDir, 'public/omics'));
    } else if (kind === 'destination leaf') {
      fs.mkdirSync(path.join(f.websiteDir, 'public/omics'), { recursive: true });
      fs.symlinkSync(path.join(outside, 'missing.json'), path.join(f.websiteDir, 'public/omics/manifest.json'));
    } else if (kind === 'source ancestor') {
      fs.renameSync(path.join(f.dataDir, 'website/files'), path.join(outside, 'files'));
      fs.symlinkSync(path.join(outside, 'files'), path.join(f.dataDir, 'website/files'));
    } else {
      fs.renameSync(path.join(f.websiteDir, 'workbench'), path.join(outside, 'workbench'));
      fs.symlinkSync(path.join(outside, 'workbench'), path.join(f.websiteDir, 'workbench'));
    }
    await expect(f.hydrate()).rejects.toThrow(/symlink/i);
    expect(fs.existsSync(path.join(outside, 'manifest.json'))).toBe(false);
  });

  it('rejects missing required data even if an old output is cached', async () => {
    const f = await fixture();
    await f.hydrate();
    f.manifest.files = f.manifest.files.filter(entry => entry.destination !== 'data/benchmark-literature/papers.json');
    f.pin();
    await expect(f.hydrate()).rejects.toThrow(/Required destination missing/);
  });

  it('validates historical scope before cached reuse and current-only filtering', async () => {
    const f = await fixture();
    await f.hydrate();
    f.manifest.files.find(entry => entry.scope === 'historical')!.scope = 'current';
    f.pin();
    await expect(f.hydrate(true)).rejects.toThrow(/Invalid scope/);
  });

  it('validates current pointers when cached as tracked files', async () => {
    const f = await fixture();
    const content = Buffer.from(JSON.stringify({ release_id: '2026-09-25-8af07e960e5f' }));
    for (const destination of ['public/omics/catalogue.json', `public/omics/releases/${f.releaseId}/catalogue.json`]) {
      const entry = f.manifest.files.find(item => item.destination === destination)!;
      entry.sha256 = crypto.createHash('sha256').update(content).digest('hex');
      entry.bytes = content.length;
      fs.writeFileSync(path.join(f.dataDir, entry.source), zlib.gzipSync(content));
      const target = path.join(f.websiteDir, destination);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    execSync('git init -b main', { cwd: f.websiteDir, stdio: 'ignore' });
    execSync('git add public', { cwd: f.websiteDir });
    f.pin();
    await expect(f.hydrate()).rejects.toThrow(/Stale current pointer/);
  });

  it('aborts decompression at declared byte limit without promoting files', async () => {
    const f = await fixture();
    const entry = f.manifest.files.find(item => item.destination === 'data/benchmark-literature/papers.json')!;
    entry.bytes = 1;
    fs.writeFileSync(path.join(f.dataDir, entry.source), zlib.gzipSync(Buffer.alloc(1024 * 1024)));
    f.pin();
    await expect(f.hydrate()).rejects.toThrow(/exceeds declared 1 bytes/);
    expect(fs.existsSync(path.join(f.websiteDir, entry.destination))).toBe(false);
    expect(fs.readdirSync(path.join(f.websiteDir, 'workbench'))).toEqual(['keep-me.txt']);
  });

  it('refuses conflicting immutable receipts', async () => {
    const f = await fixture();
    const receipt = path.join(f.websiteDir, `data/omics/releases/${f.releaseId}.json`);
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    fs.writeFileSync(receipt, 'original receipt');
    await expect(f.hydrate()).rejects.toThrow(/conflicting immutable release file/);
    expect(fs.readFileSync(receipt, 'utf8')).toBe('original receipt');
  });

  it('rejects missing historical artifacts even during current-only hydration', async () => {
    const f = await fixture();
    const removed = f.manifest.files.find(entry => entry.scope === 'historical' && entry.destination.endsWith('catalogue.json'))!;
    f.manifest.files = f.manifest.files.filter(entry => entry !== removed);
    f.pin();
    await expect(f.hydrate(true)).rejects.toThrow(/catalogue_sha256 mismatch/);
  });

  it('hydrates a sparse current-only checkout with historical source directories absent', async () => {
    const f = await fixture();
    const historical = f.manifest.files.filter(entry => entry.scope === 'historical');
    expect(historical.length).toBeGreaterThan(0);
    for (const entry of historical) {
      fs.rmSync(path.dirname(path.join(f.dataDir, entry.source)), { recursive: true, force: true });
    }
    const result = await f.hydrate(true);
    expect(result.skippedCount).toBe(historical.length);
    expect(fs.existsSync(path.join(f.websiteDir, `public/omics/releases/${f.releaseId}/catalogue.json`))).toBe(true);
    for (const entry of f.manifest.files.filter(entry => entry.destination.startsWith('data/omics/releases/'))) {
      expect(fs.existsSync(path.join(f.websiteDir, entry.destination))).toBe(true);
    }
    await expect(f.hydrate(false)).rejects.toThrow(/ENOENT/);
  });

  it('still rejects symlink ancestors of skipped historical sources', async () => {
    const f = await fixture();
    const entry = f.manifest.files.find(item => item.scope === 'historical')!;
    const directory = path.dirname(path.join(f.dataDir, entry.source));
    fs.rmSync(directory, { recursive: true, force: true });
    fs.symlinkSync(path.join(f.tmpRoot, 'missing-target'), directory);
    await expect(f.hydrate(true)).rejects.toThrow(/Symlink path rejected/);
  });

  it('supports direct immutable archive sources', async () => {
    const f = await fixture();
    const entry = f.manifest.files.find(item => item.scope === 'historical')!;
    const archive = `data/omics/releases/${entry.destination.split('/').slice(3).join('/')}.gz`;
    fs.mkdirSync(path.dirname(path.join(f.dataDir, archive)), { recursive: true });
    fs.renameSync(path.join(f.dataDir, entry.source), path.join(f.dataDir, archive));
    entry.source = archive;
    f.pin();
    await expect(f.hydrate()).resolves.toMatchObject({ release_id: f.releaseId });
  });

  function addDuplicateArchives(f: Awaited<ReturnType<typeof fixture>>) {
    const content = Buffer.from('Repeated immutable audit payload\n');
    const destinations = [f.releaseId, '2026-09-25-8af07e960e5f', '2026-09-16-b5213be10a49'].map(id => `public/omics/releases/${id}/audit-shared.bin`);
    for (const destination of destinations) {
      const source = `website/files/${destination}.gz`;
      fs.mkdirSync(path.dirname(path.join(f.dataDir, source)), { recursive: true });
      fs.writeFileSync(path.join(f.dataDir, source), zlib.gzipSync(content));
      f.manifest.files.push({ destination, source, bytes: content.length,
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        scope: destination.includes(f.releaseId) ? 'current' : 'historical' });
    }
    f.pin();
    return destinations.map(destination => path.join(f.websiteDir, destination));
  }

  it('hardlinks newly verified identical archives while keeping mutable pointers independent', async () => {
    const f = await fixture();
    const copies = addDuplicateArchives(f);
    await f.hydrate();
    expect(copies.map(file => fs.statSync(file).ino)).toEqual(Array(3).fill(fs.statSync(copies[0]).ino));
    expect(fs.statSync(path.join(f.websiteDir, 'public/omics/catalogue.json')).ino)
      .not.toBe(fs.statSync(path.join(f.websiteDir, `public/omics/releases/${f.releaseId}/catalogue.json`)).ino);
    const before = copies.map(file => fs.statSync(file).ino);
    await expect(f.hydrate()).resolves.toMatchObject({ hydratedCount: 0 });
    expect(copies.map(file => fs.statSync(file).ino)).toEqual(before);
  });

  it('uses an existing archive only after verifying it and leaves its inode intact', async () => {
    const f = await fixture();
    const copies = addDuplicateArchives(f);
    fs.mkdirSync(path.dirname(copies[0]), { recursive: true });
    fs.writeFileSync(copies[0], 'Repeated immutable audit payload\n');
    const inode = fs.statSync(copies[0]).ino;
    await f.hydrate();
    expect(copies.map(file => fs.statSync(file).ino)).toEqual(Array(3).fill(inode));
  });

  it('does not relink already existing identical archives', async () => {
    const f = await fixture();
    const copies = addDuplicateArchives(f);
    for (const file of copies) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'Repeated immutable audit payload\n');
    }
    const inodes = copies.map(file => fs.statSync(file).ino);
    expect(new Set(inodes).size).toBe(3);
    await f.hydrate();
    expect(copies.map(file => fs.statSync(file).ino)).toEqual(inodes);
  });

  it('rejects a deduplication donor changed after an earlier link', async () => {
    const f = await fixture();
    const copies = addDuplicateArchives(f);
    const link = fs.linkSync.bind(fs);
    let corrupted = false;
    vi.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      link(source, destination);
      if (!corrupted && String(source).endsWith('/audit-shared.bin')) {
        fs.writeFileSync(source, 'Changed immutable audit payload!\n');
        corrupted = true;
      }
    });
    await expect(f.hydrate()).rejects.toThrow(/Verified archive changed before deduplication/);
    expect(copies.some(file => fs.existsSync(file))).toBe(false);
    expect(fs.readdirSync(path.join(f.websiteDir, 'workbench'))).toEqual(['keep-me.txt']);
  });

  it('refuses an existing conflicting duplicate without overwriting it', async () => {
    const f = await fixture();
    const copies = addDuplicateArchives(f);
    fs.mkdirSync(path.dirname(copies[1]), { recursive: true });
    fs.writeFileSync(copies[1], 'preserved conflicting bytes');
    const inode = fs.statSync(copies[1]).ino;
    await expect(f.hydrate()).rejects.toThrow(/conflicting immutable release file/);
    expect(fs.readFileSync(copies[1], 'utf8')).toBe('preserved conflicting bytes');
    expect(fs.statSync(copies[1]).ino).toBe(inode);
    expect(fs.existsSync(copies[0])).toBe(false);
  });

  it('rejects corrupted first payload before using it as a deduplication donor', async () => {
    const f = await fixture();
    const copies = addDuplicateArchives(f);
    const entry = f.manifest.files.find(item => item.destination === path.relative(f.websiteDir, copies[0]))!;
    fs.writeFileSync(path.join(f.dataDir, entry.source), 'invalid gzip');
    await expect(f.hydrate()).rejects.toThrow(/Corrupted gzip stream/);
    expect(copies.some(file => fs.existsSync(file))).toBe(false);
  });

  it('rejects unsafe release IDs', () => {
    expect(() => verifyLock({ schema_version: 1, repository: 'rewire-bio/rewire-benchmark-data', revision: 'a'.repeat(40), manifest_sha256: 'a'.repeat(64), release_id: '../escape' })).toThrow(/Invalid lock release_id/);
  });
});
