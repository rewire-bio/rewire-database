import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, appendFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RECEIPT_SCHEMA = 1;
export const ORIGIN = 'https://rewire-it.web.app';
const digest = value => createHash('sha256').update(value).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function validReceipt(value) {
  return value && value.schema === RECEIPT_SCHEMA &&
    /^[a-f0-9]{40}$/.test(value.commit || '') &&
    /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(value.release_id || '') &&
    ['data', 'backend', 'hosting'].every(key => sha(value.fingerprints?.[key])) &&
    sha(value.manifest_sha256);
}
export async function publicBytes(filename, { fetchImpl = fetch, limit = 256 * 1024 } = {}) {
  if (!['deployment.json', 'omics/manifest.json'].includes(filename)) throw new Error('Unexpected publication metadata path');
  const response = await fetchImpl(`${ORIGIN}/${filename}?verify=${Date.now()}`, {
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

export function inputGroups(filename) {
  const shared = filename === '.github/workflows/firebase.yml' || /^package(-lock)?\.json$/.test(filename) || /^(scripts\/(deployment-plan|backend-deployment|configure-contribution-deployment|contribution-deployment|deploy-catalogue|hosting-web-deploy|deployment-transaction)\.mjs)$/.test(filename);
  return {
    // Published artifact identity is independent of frontend source changes.
    data: filename === 'benchmark-data.lock.json',
    backend: shared || /^services\/omics\/(src\/|package(?:-lock)?\.json$|tsconfig.*\.json$|firestore\..*)/.test(filename) ||
      /^(firebase\.json|firestore\..*)$/.test(filename),
    hosting: filename === 'firebase.json',
  };
}
/** Hash names and bytes, including tracked deletions; never include generated/private files. */
/** @param {string} root @param {Record<string, string | undefined>} env */
export async function fingerprints(root = process.cwd(), env = process.env) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean).sort();
  const hashes = Object.fromEntries(['data', 'backend', 'hosting'].map(key => [key, createHash('sha256').update(`deployment-inputs-v${RECEIPT_SCHEMA}\0`)]));
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
  for (const name of ['OMICS_CONTRIBUTIONS_ENABLED', 'OMICS_MAIL_ENABLED', 'FIREBASE_PROJECT_ID']) {
    hashes.backend.update(`${name}\0${env[name] || ''}\0`);
  }
  return Object.fromEntries(Object.entries(hashes).map(([key, hash]) => [key, hash.digest('hex')]));
}
export function classify(current, previous, forceFull = false) {
  const valid = validReceipt(previous);
  return {
    mode: !forceFull && valid && current.data === previous.fingerprints.data && current.hosting === previous.fingerprints.hosting ? 'web' : 'full',
    backend: forceFull || !valid || current.backend !== previous.fingerprints.backend,
  };
}
export async function writeReceipt(root = process.cwd()) {
  const plan = JSON.parse(await readFile(path.join(root, 'workbench/deployment-plan.json'), 'utf8'));
  const bytes = await readFile(path.join(root, 'public/omics/manifest.json'));
  const receipt = { schema: RECEIPT_SCHEMA, commit: plan.commit, release_id: JSON.parse(bytes).release_id,
    fingerprints: plan.fingerprints, manifest_sha256: digest(bytes) };
  if (!validReceipt(receipt)) throw new Error('Invalid generated deployment receipt');
  if (plan.mode === 'web' && (receipt.release_id !== plan.previous.release_id || receipt.manifest_sha256 !== plan.previous.manifest_sha256)) {
    throw new Error('Current catalogue differs from the published release; run a full build');
  }
  await writeFile(path.join(root, 'out/deployment.json'), JSON.stringify(receipt, null, 2) + '\n');
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
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `mode=${plan.mode}\nbackend=${plan.backend}\ncompiler_env=${compilerEnvironment}\n`);
  console.log(`Build: ${plan.mode}; backend deployment: ${plan.backend ? 'required' : 'unchanged'}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
