import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, appendFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Schema 3: the frontend image and its data pin are separate. A receipt names
// the image commit (frontend_version) and the producer release it serves.
export const RECEIPT_SCHEMA = 3;
export const ORIGIN = 'https://benchmarks.rewirebio.io';
export const FINGERPRINTS = ['data', 'backend', 'hosting', 'frontend'];
const digest = value => createHash('sha256').update(value).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function validReceipt(value) {
  return value && value.schema === RECEIPT_SCHEMA &&
    /^[a-f0-9]{40}$/.test(value.commit || '') && /^[a-f0-9]{40}$/.test(value.frontend_version || '') &&
    /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(value.release_id || '') &&
    FINGERPRINTS.every(key => sha(value.fingerprints?.[key])) &&
    value.producer_repository === 'rewire-bio/rewire-benchmark-data' && /^[a-f0-9]{40}$/.test(value.producer_revision || '') &&
    sha(value.producer_manifest_sha256) && sha(value.manifest_sha256);
}
export async function publicBytes(filename, { fetchImpl = fetch, limit = 256 * 1024 } = {}) {
  if (!['deployment.json', 'omics/manifest.json'].includes(filename)) throw new Error('Unexpected publication metadata path');
  const metadata = filename === 'omics/manifest.json' ? 'release-manifest.json' : filename;
  const response = await fetchImpl(`${ORIGIN}/${metadata}?verify=${Date.now()}`, {
    redirect: 'manual', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 200) throw new Error(`Publication metadata unavailable (${response.status})`);
  const chunks = []; let length = 0;
  if (!response.body) throw new Error('Empty publication metadata');
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('Publication metadata too large');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
export async function publishedReceipt(options) {
  try {
    const receipt = JSON.parse((await publicBytes('deployment.json', { ...options, limit: 8192 })).toString());
    return validReceipt(receipt) ? receipt : null;
  } catch { return null; } // First deployment, unavailable origin, or unknown schema: rebuild everything.
}

/**
 * Service modules the website never imports. Changing only these redeploys
 * the backend without building a frontend image. Every other service module
 * (the query engine, page builder, schemas) is shared and changes both.
 * tests/deployment-plan.test.ts rechecks this list against the website's imports.
 */
export const BACKEND_ONLY_SOURCES = new Set([
  'audit-import', 'audit-service', 'auth', 'catalogue-integrity', 'catalogue-service', 'catalogue', 'cli', 'firebase',
  'functions', 'google-mail', 'grant-curator', 'http-handler', 'import-cli', 'mail-transport', 'mail-worker', 'outbox',
  'private-backup', 'record-page-store', 'request-limits', 'research-store', 'router', 'sdk-proteingym-reference',
  'sdk-sequence-reference', 'sdk-sequence', 'sdk-submission', 'server', 'store', 'use-case-import', 'use-case-service', 'validation',
].map(name => `services/omics/src/${name}.ts`));
/** The producer's compiled candidate-model taxonomy: ignored by Git, built into the image. */
export const COMPILED_TAXONOMY = 'lib/generated-benchmark-catalog.ts';

export function inputGroups(filename) {
  const shared = /^(scripts\/(configure-contribution-deployment|contribution-deployment)\.mjs)$/.test(filename);
  // Not image inputs: documentation, tests, and hydrated producer data (pinned at runtime).
  const documentation = /^(\.github\/|docs\/|tests\/|smoke\/|data\/|public\/omics\/|README\.md$|AGENTS\.md$)/.test(filename);
  // Within the service, only shared source modules are bundled into the website.
  const backendOnly = filename.startsWith('services/omics/') && (!filename.startsWith('services/omics/src/') || BACKEND_ONLY_SOURCES.has(filename));
  return {
    // Published artifact identity is independent of frontend source changes.
    data: filename === 'benchmark-data.lock.json',
    backend: shared || /^services\/omics\/(src\/|package(?:-lock)?\.json$|tsconfig.*\.json$|firestore\..*)/.test(filename) ||
      /^(firebase\.json|firestore\..*)$/.test(filename),
    // The Cloudflare Worker: routing code and the legacy redirects it serves.
    hosting: filename === 'firebase.json' || filename === 'wrangler.jsonc' || filename.startsWith('cloudflare/'),
    // Anything the image is built from. The data pin is applied at runtime.
    frontend: filename !== 'benchmark-data.lock.json' && !documentation && !backendOnly,
  };
}
/** Hash names and bytes, including tracked deletions; never include generated/private files. */
/** @param {string} root @param {Record<string, string | undefined>} env */
export async function fingerprints(root = process.cwd(), env = process.env) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean).sort();
  const hashes = Object.fromEntries(FINGERPRINTS.map(key => [key, createHash('sha256').update(`deployment-inputs-v${RECEIPT_SCHEMA}\0`)]));
  for (const name of files) {
    const selected = Object.entries(inputGroups(name)).filter(([, include]) => include).map(([key]) => hashes[key]);
    if (!selected.length) continue;
    selected.forEach(hash => hash.update(`${name}\0`));
    let stat;
    try { stat = await lstat(path.join(root, name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!stat) { selected.forEach(hash => hash.update('deleted\0')); continue; }
    if (!stat.isFile()) throw new Error(`Input must be a regular file: ${name}`);
    selected.forEach(hash => hash.update(`file:${stat.size}\0`));
    for await (const chunk of createReadStream(path.join(root, name))) selected.forEach(hash => hash.update(chunk));
  }
  // The compiled taxonomy is untracked but part of the image: a lock change that
  // changes it must build a new image rather than reuse one that would refuse to start.
  let taxonomy;
  try { taxonomy = await readFile(path.join(root, COMPILED_TAXONOMY)); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${COMPILED_TAXONOMY} is missing; run npm run data:prepare -- --current-only before planning`);
    throw error;
  }
  hashes.frontend.update(`${COMPILED_TAXONOMY}\0${digest(taxonomy)}\0`);
  for (const name of ['OMICS_CONTRIBUTIONS_ENABLED', 'OMICS_MAIL_ENABLED', 'FIREBASE_PROJECT_ID']) {
    hashes.backend.update(`${name}\0${env[name] || ''}\0`);
  }
  return Object.fromEntries(Object.entries(hashes).map(([key, hash]) => [key, hash.digest('hex')]));
}
/**
 * mode: 'full' adopts a new data release (import, pages, activation); 'web' keeps it.
 * frontend: a new image is built; otherwise the live image is redeployed with the pin.
 * edge: the Cloudflare Worker changed. backend: Functions or Firestore config changed.
 */
export function classify(current, previous, forceFull = false) {
  const valid = validReceipt(previous);
  const changed = key => forceFull || !valid || current[key] !== previous.fingerprints[key];
  return {
    mode: changed('data') ? 'full' : 'web',
    backend: changed('backend'),
    frontend: changed('frontend'),
    edge: changed('hosting'),
  };
}
/** Core acceptance is available only after a verified UI-only plan. */
export function liveAcceptanceProfile(plan) {
  const checked = classify(plan.fingerprints, plan.previous, plan.force_full);
  return plan.mode === 'web' && plan.backend === false && checked.mode === 'web' && checked.backend === false ? 'core' : 'full';
}
export const RECEIPT_FILE = 'workbench/deployment-receipt.json';
/** The receipt the deployed revision serves at /deployment.json (via its environment). */
export async function writeReceipt(root = process.cwd()) {
  const plan = JSON.parse(await readFile(path.join(root, 'workbench/deployment-plan.json'), 'utf8'));
  const bytes = await readFile(path.join(root, 'public/omics/manifest.json'));
  const pin = JSON.parse(await readFile(path.join(root, 'benchmark-data.lock.json'), 'utf8'));
  // A data-only adoption keeps the live image, so its version is the live one.
  const frontend_version = plan.frontend === false ? plan.previous?.frontend_version : plan.commit;
  const receipt = { schema: RECEIPT_SCHEMA, commit: plan.commit, frontend_version, release_id: JSON.parse(bytes).release_id,
    producer_repository: pin.repository, producer_revision: pin.revision, producer_manifest_sha256: pin.manifest_sha256,
    fingerprints: plan.fingerprints, manifest_sha256: digest(bytes) };
  if (!validReceipt(receipt)) throw new Error('Invalid generated deployment receipt');
  if (receipt.release_id !== pin.release_id) throw new Error('Hydrated release differs from the data pin');
  if (plan.mode === 'web' && (receipt.release_id !== plan.previous.release_id || receipt.manifest_sha256 !== plan.previous.manifest_sha256)) {
    throw new Error('Current catalogue differs from the published release; run a full build');
  }
  await mkdir(path.join(root, 'workbench'), { recursive: true });
  await writeFile(path.join(root, RECEIPT_FILE), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
export async function assertPublishedBase(plan, expectedManifest, options) {
  if (!validReceipt(plan.previous)) throw new Error('Missing published base');
  const current = await publishedReceipt(options);
  if (!current || JSON.stringify(current) !== JSON.stringify(plan.previous)) throw new Error('Published build changed; rebuild before deploying');
  const bytes = await publicBytes('omics/manifest.json', options);
  if (!bytes.equals(expectedManifest) || digest(bytes) !== current.manifest_sha256) throw new Error('Published catalogue differs; a full release is required');
}
async function main() {
  if (process.argv.includes('--receipt')) { await writeReceipt(); return; }
  const current = await fingerprints();
  const previous = await publishedReceipt();
  const forceFull = process.argv.includes('--force-full') || process.env.FORCE_FULL === 'true';
  const plan = { schema: RECEIPT_SCHEMA, force_full: forceFull, ...classify(current, previous, forceFull), fingerprints: current, previous,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() };
  await mkdir('workbench', { recursive: true });
  await writeFile('workbench/deployment-plan.json', JSON.stringify(plan, null, 2) + '\n');
  const compilerEnvironment = digest(JSON.stringify(Object.entries(process.env).filter(([key]) => key.startsWith('NEXT_PUBLIC_')).sort()));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `mode=${plan.mode}\nbackend=${plan.backend}\nfrontend=${plan.frontend}\nedge=${plan.edge}\ncompiler_env=${compilerEnvironment}\n`);
  console.log(`Data: ${plan.mode === 'full' ? 'adopt pinned release' : 'unchanged'}; image: ${plan.frontend ? 'build' : 'reuse live'}; Worker: ${plan.edge ? 'deploy' : 'unchanged'}; backend: ${plan.backend ? 'required' : 'unchanged'}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
