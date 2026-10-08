import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNotSmokeExport } from './assert-not-smoke-export.mjs';
import { contributionProbeMode } from './contribution-deployment.mjs';
import { fingerprints, publishedReceipt, validReceipt } from './deployment-plan.mjs';
import { measureDeploymentStage as measure } from './deployment-metrics.mjs';
import { fetchWithRetry } from './deployment-transaction.mjs';

export const CATALOGUE_API = 'https://europe-west2-rewire-it.cloudfunctions.net/contributions';
const releaseIdentity = value => /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(value || '');

/** Read-only and unauthenticated: importing this module never loads Firebase Admin. */
export async function currentApiRelease({ fetchImpl = fetch } = {}) {
  const response = await fetchWithRetry(`${CATALOGUE_API}/api/trpc/catalogue.release?input=%7B%7D&verify=${Date.now()}`, {
    fetchImpl, redirect: 'manual', timeoutMs: 120_000, expectedContentType: 'application/json',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (response.status !== 200) throw new Error(`Public catalogue release unavailable (${response.status})`);
  const body = await response.json();
  const release = body.result?.data?.release_id;
  if (!releaseIdentity(release)) throw new Error('Public API returned an invalid catalogue release identity');
  return release;
}

/**
 * Cloudflare owns Worker rollback; this transaction restores only its own data pointer.
 * @param {{ releaseId: string, capture: () => Promise<string>, assertBase: (previous: string) => Promise<void>,
 * importRelease: () => Promise<unknown>, activate: (release: string, expected: string) => Promise<unknown>,
 * verifyApi: () => Promise<unknown>, publishFrontend: () => Promise<unknown>,
 * restoreRelease: (previous: string, attempted: string) => Promise<unknown> }} actions
 */
export async function deployIndependentFrontend(actions) {
  const previous = await actions.capture();
  if (!releaseIdentity(previous) || !releaseIdentity(actions.releaseId))
    throw new Error('A valid existing API release is required for rollback');
  await actions.assertBase(previous);
  const changesData = previous !== actions.releaseId;
  // Failed immutable import has no public effect; never roll back an unrelated pointer.
  if (changesData) await actions.importRelease();
  let activationAttempted = false;
  try {
    if (changesData) {
      activationAttempted = true; // A transport failure may follow a successful commit.
      await actions.activate(actions.releaseId, previous);
    }
    await actions.verifyApi();
    await actions.publishFrontend();
  } catch (cause) {
    const failures = [cause];
    if (activationAttempted) {
      try { await actions.restoreRelease(previous, actions.releaseId); }
      catch (error) { failures.push(error); }
    }
    throw new AggregateError(failures, failures.length === 1
      ? 'Independent frontend deployment failed; catalogue pointer retained or restored.'
      : 'Independent frontend deployment failed and catalogue rollback needs operator attention.');
  }
  return { release_id: actions.releaseId, catalogue_changed: changesData };
}

/** @param {any} db @param {string} previous @param {string} attempted */
export async function restorePublicationPointer(db, previous, attempted) {
  // Rollback never reimports data or deletes release documents. A failed CAS activation
  // cannot justify replacing a concurrent publisher's pointer.
  await db.runTransaction(async tx => {
    const pointer = db.doc('cataloguePublication/active');
    const current = (await tx.get(pointer)).data()?.release_id;
    if (current === previous) return;
    if (current !== attempted) throw new Error('Catalogue pointer changed during rollback; operator attention required');
    const release = (await tx.get(db.doc(`catalogueReleases/${previous}`))).data();
    if (release?.state !== 'ready' || !release.published_at)
      throw new Error('Previous catalogue release is not published and ready');
    tx.set(pointer, { release_id: previous, previous_release_id: attempted, activated_at: new Date().toISOString() });
  });
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(undefined) : reject(new Error(`${args[0]} failed (${code})`)));
  });
}

async function checkedInputs() {
  const plan = JSON.parse(await readFile('workbench/deployment-plan.json', 'utf8'));
  const receipt = JSON.parse(await readFile('out/deployment.json', 'utf8'));
  const manifestBytes = await readFile('public/omics/manifest.json');
  const manifest = JSON.parse(manifestBytes.toString());
  const pin = JSON.parse(await readFile('benchmark-data.lock.json', 'utf8'));
  if (!validReceipt(receipt) || !['web', 'full'].includes(plan.mode) ||
      receipt.producer_repository !== pin.repository || receipt.producer_revision !== pin.revision || receipt.release_id !== pin.release_id ||
      receipt.commit !== plan.commit || receipt.release_id !== manifest.release_id ||
      receipt.manifest_sha256 !== createHash('sha256').update(manifestBytes).digest('hex') ||
      JSON.stringify(receipt.fingerprints) !== JSON.stringify(plan.fingerprints) ||
      JSON.stringify(await fingerprints()) !== JSON.stringify(plan.fingerprints))
    throw new Error('Independent publication does not match checked source and catalogue');
  return { plan, receipt };
}

export async function main(args = process.argv.slice(2)) {
  assertNotSmokeExport();
  const { plan, receipt } = await checkedInputs();
  const previous = await currentApiRelease();
  const changesData = previous !== receipt.release_id;
  if (args.includes('--inspect')) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
      `data_required=${changesData}\nbackend_required=${Boolean(plan.backend)}\napi_release_id=${previous}\n`);
    console.log(`Catalogue import ${changesData ? 'required' : 'unchanged'}; frontend release ${receipt.release_id}`);
    return;
  }
  if (changesData || plan.backend) {
    if (process.env.GCLOUD_PROJECT !== 'rewire-it' || process.env.NODE_ENV !== 'production')
      throw new Error('Data/backend publication requires the explicit production project and environment');
    await run(['node', 'scripts/backend-deployment.mjs', '--assert']);
  } else if (!validReceipt(plan.previous) || plan.previous.fingerprints.backend !== plan.fingerprints.backend) {
    throw new Error('Frontend-only deployment requires a checked matching backend receipt');
  }
  const contributionArgument = `--contributions=${contributionProbeMode()}`;
  const acceptanceArgument = `--acceptance=${changesData || plan.backend ? 'full' : 'core'}`;
  // One lazy Admin instance survives activation and potential rollback. Loading it
  // for a pure frontend update would unnecessarily require Google credentials.
  let dataDb;
  async function dataDatabase() {
    if (!dataDb) {
      const { firebase } = await import('../services/omics/dist/firebase.js');
      dataDb = firebase().db;
    }
    return dataDb;
  }
  try { await deployIndependentFrontend({
    releaseId: receipt.release_id,
    capture: () => Promise.resolve(previous),
    async assertBase(expected) {
      if (await currentApiRelease() !== expected) throw new Error('API publication changed during preparation; rebuild before publishing');
      if (validReceipt(plan.previous) && JSON.stringify(await publishedReceipt()) !== JSON.stringify(plan.previous))
        throw new Error('Frontend publication changed during preparation; rebuild before publishing');
    },
    importRelease: () => measure('catalogue.import', () => run(['node', '--import', 'tsx',
      'services/omics/src/import-cli.ts', 'public/omics/catalogue.json', 'public/omics/manifest.json'])),
    async activate(release, expected) {
      // Firebase is loaded exclusively for data activation. Pure UI publication stays unauthenticated.
      const { activateRelease } = await import('../services/omics/dist/catalogue-service.js');
      const db = await dataDatabase();
      await measure('catalogue.activation', () => activateRelease(db, release, { expectedPreviousReleaseId: expected }));
    },
    verifyApi: () => measure('catalogue.api_verification', () => run(['node', 'scripts/check-live-catalogue.mjs',
      CATALOGUE_API, contributionArgument, acceptanceArgument])),
    async publishFrontend() {
      if (await currentApiRelease() !== receipt.release_id)
        throw new Error('API publication changed before frontend upload; refusing a mismatched publication');
      await run(['node', 'scripts/deploy-cloudflare.mjs']);
    },
    async restoreRelease(oldRelease, attempted) {
      const db = await dataDatabase();
      await measure('catalogue.rollback', () => restorePublicationPointer(db, oldRelease, attempted));
    },
  }); } finally { if (dataDb) await dataDb.terminate(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
