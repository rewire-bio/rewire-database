import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyServing } from './fetch-serving-data.mjs';
import { syncShared } from './sync-shared.mjs';
import { isCurrentOnlyEntry } from './prepare-benchmark-data.mjs';
import { fetchVerifiedAsset, releaseHasAssets, usesReleaseAssets, verifyCompressed } from './release-assets.mjs';

// Adopt the newest published data release: point benchmark-data.lock.json at
// the producer commit its prepared file was published from, and copy that
// commit's shared code into shared/omics. Used by .github/workflows/adopt-data-release.yml;
// it never adopts an older release than the one pinned.
// It refuses a release that withholds use-case mappings the pinned release
// serves, unless told otherwise. A release whose website files are assets of
// its serving/<id> GitHub release is pinned with serving.website_assets; older
// releases keep their files in Git and are read from there.
// It refuses a release whose serving tag names a commit that was not made
// directly on the commit the release was built from, because shared/omics is
// copied from the tagged commit and must be the code the release was built with.
//   node scripts/adopt-data-release.mjs [--release <release-id>] [--allow-withheld-mappings]
const REPOSITORY = 'rewire-bio/rewire-benchmark-data';
const RELEASE_ID = /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;
const RELEASE_CONFIG = 'data/omics/release-config.json';
/**
 * The first release whose serving tag rewire-benchmark-data guarantees to name the release
 * commit (scripts/release/commit.mjs there). Earlier releases were tagged differently and
 * are not checked.
 */
export const FIRST_RELEASE_COMMIT_CHECKED = '2026-11-21-4940d4f45aee';
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

/**
 * Whether a release's tagged commit must pass checkReleaseCommit: every release from
 * FIRST_RELEASE_COMMIT_CHECKED on, by the publication order of `releases` (servingReleases).
 * Release IDs do not sort by time within a day, so they are never compared as text. A
 * release that cannot be placed against the first checked one is checked.
 */
export function releaseCommitChecked(releases, releaseId) {
  const ids = releases.map(release => release.tagName.slice(8));
  const first = ids.indexOf(FIRST_RELEASE_COMMIT_CHECKED);
  const position = ids.indexOf(releaseId);
  return first < 0 || position < 0 || position >= first;
}

/**
 * Throws unless the commit a serving tag names has exactly one parent, and that parent is
 * the `source_revision` in the commit's own release config. `config` is the text of
 * data/omics/release-config.json at the commit, `parents` the commit's parent SHAs.
 * Returns the commit the release was built from.
 */
export function checkReleaseCommit({ tag, revision, parents, config }) {
  let built;
  try { built = JSON.parse(String(config)).source_revision; } catch { throw new Error(`Refusing ${tag}: ${RELEASE_CONFIG} at ${revision} is not valid JSON`); }
  if (!/^[a-f0-9]{40}$/.test(built || '')) throw new Error(`Refusing ${tag}: ${RELEASE_CONFIG} at ${revision} records no source_revision`);
  if (parents.length !== 1 || parents[0] !== built)
    throw new Error(`Refusing ${tag}: it names commit ${revision} with parent ${parents.join(' and ') || '(none)'}, but the release was built from ${built}. The tagged commit must have the built commit as its only parent, or shared/omics would be copied from code the release was not built with.`);
  return built;
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

/**
 * Whether a release's website files are assets of its serving release, from the
 * asset names it lists. A release with none of them must have every current
 * file in Git at its revision (`tracked`: the paths there); otherwise its
 * publication is incomplete, and it is refused rather than pinned to missing files.
 */
export function publishedAsAssets(manifest, assetNames, tracked) {
  const entries = JSON.parse(manifest.toString('utf8')).files.filter(isCurrentOnlyEntry);
  if (releaseHasAssets(assetNames, entries)) return true;
  const missing = tracked ? entries.filter(entry => !tracked.has(entry.source)).map(entry => entry.source) : [];
  if (missing.length) throw new Error(`The release has neither release assets nor files in Git for ${missing.length} current files: ${missing.slice(0, 5).join(', ')}`);
  return false;
}

/** Paths in Git at a producer revision under the manifest's source directories (reads trees only). */
function trackedSources(producer, revision, manifest) {
  const directories = [...new Set(JSON.parse(manifest.toString('utf8')).files.map(entry => path.posix.dirname(entry.source)))];
  return new Set(run('git', ['-C', producer, 'ls-tree', '-r', '--name-only', revision, '--', ...directories], { maxBuffer: 64 * 1024 ** 2 }).split('\n').filter(Boolean));
}

/**
 * A pinned release's use-case artifact, or null when its manifest lists none.
 * The manifest at the pinned revision must match the pin and the artifact its
 * entry: read from the release asset for a release published as assets,
 * otherwise from Git at that revision. Any failure throws, so the
 * withheld-mapping check is never skipped silently.
 */
export async function useCasesOf(producer, pin, { fetchImpl = fetch, show = gitShow } = {}) {
  const manifest = show(producer, `${pin.revision}:website/manifest.json`);
  if (sha256(manifest) !== pin.manifest_sha256) throw new Error(`The producer manifest at ${pin.revision} differs from the pin for ${pin.release_id}`);
  const entry = JSON.parse(manifest.toString('utf8')).files.find(file => file.destination === `public/omics/releases/${pin.release_id}/use-cases.json`);
  if (!entry) return null;
  const bytes = usesReleaseAssets(pin)
    ? await fetchVerifiedAsset(pin, entry, { fetchImpl })
    : verifyCompressed(show(producer, `${pin.revision}:${entry.source}`), entry);
  return JSON.parse(bytes.toString('utf8'));
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
    // Before anything is written: the tag must name the release commit.
    if (releaseCommitChecked(releases, releaseId)) {
      let config;
      try { config = gitShow(producer, `${revision}:${RELEASE_CONFIG}`); } catch { throw new Error(`Refusing ${tag}: commit ${revision} has no ${RELEASE_CONFIG}`); }
      const parents = run('git', ['-C', producer, 'rev-list', '--parents', '-n', '1', revision]).trim().split(' ').slice(1);
      checkReleaseCommit({ tag, revision, parents, config });
    }
    const manifest = fs.readFileSync(path.join(producer, 'website/manifest.json'));
    const assetNames = JSON.parse(gh('release', 'view', tag, '--repo', REPOSITORY, '--json', 'assets')).assets.map(asset => asset.name);
    const lock = lockFor(previous, { releaseId, revision, manifest, receipt, assets: publishedAsAssets(manifest, assetNames, trackedSources(producer, revision, manifest)) });
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
  let result;
  try {
    result = await adopt({ requested: index > 0 ? process.argv[index + 1] : undefined, allowWithheld: process.argv.includes('--allow-withheld-mappings') });
  } catch (error) {
    // An annotation on the workflow run, then a failed step: nothing is committed or deployed.
    console.error(`::error title=Data release not adopted::${String(error.message).replace(/\r?\n/g, ' ')}`);
    throw error;
  }
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `adopted=${result.adopted}\nrelease_id=${result.release_id}\n`);
}
