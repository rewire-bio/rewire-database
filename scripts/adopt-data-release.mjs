import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyServing } from './fetch-serving-data.mjs';
import { syncShared } from './sync-shared.mjs';

// Adopt the newest published data release: point benchmark-data.lock.json at
// the producer commit its prepared file was published from, and copy that
// commit's shared code into shared/omics. Used by .github/workflows/adopt-data-release.yml;
// it never adopts an older release than the one pinned.
//   node scripts/adopt-data-release.mjs [--release <release-id>]
const REPOSITORY = 'rewire-bio/rewire-benchmark-data';
const RELEASE_ID = /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
const gh = (...args) => run('gh', args);

/** Published prepared releases, oldest first. */
export function servingReleases(listing) {
  return listing.filter(release => /^serving\//.test(release.tagName) && RELEASE_ID.test(release.tagName.slice(8)) && !release.isDraft)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The release to adopt, or null when the lock already has the newest. Never moves backwards. */
export function chooseRelease(releases, current, requested) {
  const ids = releases.map(release => release.tagName.slice(8));
  if (requested) {
    if (!ids.includes(requested)) throw new Error(`No published prepared release ${requested}`);
    if (ids.includes(current) && ids.indexOf(requested) < ids.indexOf(current)) throw new Error(`${requested} is older than the pinned ${current}`);
    return requested === current ? null : requested;
  }
  const newest = ids.at(-1);
  return !newest || newest === current ? null : newest;
}

/** The lock for a release, from its tag commit, the producer manifest there and the published receipt. */
export function lockFor(previous, { releaseId, revision, manifest, receipt }) {
  const parsed = JSON.parse(manifest.toString('utf8'));
  if (parsed.release_id !== releaseId) throw new Error(`The producer manifest at ${revision} is for ${parsed.release_id}, not ${releaseId}`);
  if (receipt.release_id !== releaseId) throw new Error('The prepared file receipt names another release');
  const lock = {
    schema_version: previous.schema_version, repository: REPOSITORY, revision,
    manifest_sha256: sha256(manifest), release_id: releaseId,
    serving: { tag: `serving/${releaseId}`, file: receipt.file, sha256: receipt.sha256 },
  };
  verifyServing(lock);
  return lock;
}

function tagCommit(tag) {
  const lines = run('git', ['ls-remote', `https://github.com/${REPOSITORY}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).trim().split('\n').filter(Boolean);
  const peeled = lines.find(line => line.endsWith('^{}')) || lines[0];
  const commit = peeled?.split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error(`Cannot resolve ${tag}`);
  return commit;
}

export function adopt({ requested } = {}) {
  const lockFile = path.join(root, 'benchmark-data.lock.json');
  const previous = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  const releases = servingReleases(JSON.parse(gh('release', 'list', '--repo', REPOSITORY, '--limit', '200', '--json', 'tagName,createdAt,isDraft')));
  const releaseId = chooseRelease(releases, previous.release_id, requested);
  if (!releaseId) return { adopted: false, release_id: previous.release_id };
  const tag = `serving/${releaseId}`;
  const revision = tagCommit(tag);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-'));
  try {
    gh('release', 'download', tag, '--repo', REPOSITORY, '--pattern', `catalogue-${releaseId}.json`, '--dir', work);
    const receipt = JSON.parse(fs.readFileSync(path.join(work, `catalogue-${releaseId}.json`), 'utf8'));
    // Only the shared code and the manifest are needed from the producer commit.
    const producer = path.join(work, 'producer');
    run('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', `https://github.com/${REPOSITORY}.git`, producer]);
    run('git', ['-C', producer, 'sparse-checkout', 'set', '--no-cone', '/website/manifest.json', '/shared/omics/', '/services/omics/src/']);
    run('git', ['-C', producer, 'checkout', '--quiet', revision]);
    const manifest = fs.readFileSync(path.join(producer, 'website/manifest.json'));
    const lock = lockFor(previous, { releaseId, revision, manifest, receipt });
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
    const files = syncShared(producer);
    return { adopted: true, release_id: releaseId, previous_release_id: previous.release_id, revision, shared_files: files.length };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--release');
  const result = adopt({ requested: index > 0 ? process.argv[index + 1] : undefined });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `adopted=${result.adopted}\nrelease_id=${result.release_id}\n`);
}
