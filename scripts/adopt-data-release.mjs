import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyServing } from './fetch-serving-data.mjs';
import { syncShared } from './sync-shared.mjs';
import { isCurrentOnlyEntry } from './prepare-benchmark-data.mjs';
import { fetchVerifiedAsset, releaseHasAssets, usesReleaseAssets } from './release-assets.mjs';

// Adopt the newest published data release: point benchmark-data.lock.json at
// the producer commit its prepared file was published from, and copy that
// commit's shared code into shared/omics. Used by .github/workflows/adopt-data-release.yml;
// it never adopts an older release than the one pinned.
// It refuses a release that withholds use-case mappings the pinned release
// serves, unless told otherwise. A release whose website files are assets of
// its serving/<id> GitHub release is pinned with serving.website_assets; older
// releases keep their files in Git and are read from there.
//   node scripts/adopt-data-release.mjs [--release <release-id>] [--allow-withheld-mappings]
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

/** The lock for a release, from its tag commit, the producer manifest there, the published receipt and whether its files are assets. */
export function lockFor(previous, { releaseId, revision, manifest, receipt, assets = false }) {
  const parsed = JSON.parse(manifest.toString('utf8'));
  if (parsed.release_id !== releaseId) throw new Error(`The producer manifest at ${revision} is for ${parsed.release_id}, not ${releaseId}`);
  if (receipt.release_id !== releaseId) throw new Error('The prepared file receipt names another release');
  const lock = {
    schema_version: previous.schema_version, repository: REPOSITORY, revision,
    manifest_sha256: sha256(manifest), release_id: releaseId,
    serving: { tag: `serving/${releaseId}`, file: receipt.file, sha256: receipt.sha256, ...(assets ? { website_assets: true } : {}) },
  };
  verifyServing(lock);
  return lock;
}

/**
 * Use-case mappings that were live in the pinned release but that the new
 * release withholds automatically because their referenced evidence changed.
 * Adopting such a release silently removes reviewed evidence from the site;
 * the mappings need re-review in the data repository first.
 */
export function withheldMappings(previous, next) {
  if (!previous || !next) return [];
  const live = new Set(previous.mappings.filter(mapping => mapping.lifecycle === 'active').map(mapping => mapping.id));
  return next.mappings.filter(mapping => live.has(mapping.id) && mapping.lifecycle !== 'active' && mapping.stale_from).map(mapping => mapping.id);
}

const gitShow = (producer, object) => execFileSync('git', ['-C', producer, 'show', object], { maxBuffer: 256 * 1024 ** 2 });

/** Whether a release's website files are assets of its serving release, from the asset names it lists. */
export function publishedAsAssets(manifest, assetNames) {
  return releaseHasAssets(assetNames, JSON.parse(manifest.toString('utf8')).files.filter(isCurrentOnlyEntry));
}

/**
 * A pinned release's use-case artifact, or null for a release without one. A
 * release published as assets is read from its asset and checked against the
 * manifest at the pinned revision; an older one from Git at that revision.
 */
export async function useCasesOf(producer, pin, { fetchImpl = fetch, show = gitShow } = {}) {
  if (!usesReleaseAssets(pin)) {
    try {
      return JSON.parse(zlib.gunzipSync(show(producer, `${pin.revision}:data/omics/releases/${pin.release_id}/use-cases.json.gz`)).toString('utf8'));
    } catch { return null; }
  }
  const manifest = show(producer, `${pin.revision}:website/manifest.json`);
  if (sha256(manifest) !== pin.manifest_sha256) throw new Error(`The producer manifest at ${pin.revision} differs from the pin for ${pin.release_id}`);
  const entry = JSON.parse(manifest.toString('utf8')).files.find(file => file.destination === `public/omics/releases/${pin.release_id}/use-cases.json`);
  if (!entry) return null;
  return JSON.parse((await fetchVerifiedAsset(pin, entry, { fetchImpl })).toString('utf8'));
}

function tagCommit(tag) {
  const lines = run('git', ['ls-remote', `https://github.com/${REPOSITORY}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).trim().split('\n').filter(Boolean);
  const peeled = lines.find(line => line.endsWith('^{}')) || lines[0];
  const commit = peeled?.split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error(`Cannot resolve ${tag}`);
  return commit;
}

export async function adopt({ requested, allowWithheld = false } = {}) {
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
    const assetNames = JSON.parse(gh('release', 'view', tag, '--repo', REPOSITORY, '--json', 'assets')).assets.map(asset => asset.name);
    const lock = lockFor(previous, { releaseId, revision, manifest, receipt, assets: publishedAsAssets(manifest, assetNames) });
    run('git', ['-C', producer, 'fetch', '--quiet', '--filter=blob:none', 'origin', previous.revision]);
    const withheld = withheldMappings(await useCasesOf(producer, previous), await useCasesOf(producer, lock));
    if (withheld.length && !allowWithheld)
      throw new Error(`${releaseId} withholds ${withheld.length} use-case mappings that ${previous.release_id} serves (evidence changed since review: ${withheld.slice(0, 5).join(', ')}${withheld.length > 5 ? ', ...' : ''}). Re-review them in rewire-benchmark-data, or adopt with --allow-withheld-mappings.`);
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
    const files = syncShared(producer);
    return { adopted: true, release_id: releaseId, previous_release_id: previous.release_id, revision, shared_files: files.length };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--release');
  const result = await adopt({ requested: index > 0 ? process.argv[index + 1] : undefined, allowWithheld: process.argv.includes('--allow-withheld-mappings') });
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `adopted=${result.adopted}\nrelease_id=${result.release_id}\n`);
}
