import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { contributionProbeMode } from './contribution-deployment.mjs';
import { RECEIPT_FILE, fingerprints, liveAcceptanceProfile, publishedReceipt, validReceipt } from './deployment-plan.mjs';
import { measureDeploymentStage as measure } from './deployment-metrics.mjs';
import { fetchWithRetry } from './deployment-transaction.mjs';
import { cloudRunConfig, command as run, deployCloudRun } from './deploy-cloud-run.mjs';
import { edgeConfig, publishEdge } from './deploy-cloudflare.mjs';

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
 * Order: import a new release, make its prepared pages ready (backfilling the
 * current release if it predates them), activate the API pointer, verify the
 * API, then publish the frontend (candidate revision verified before it gets
 * traffic, then public acceptance). The frontend step owns its own rollback
 * (Cloud Run traffic, then the Worker); this transaction restores only its
 * own data pointer, and never one changed by someone else.
 * @param {{ releaseId: string, capture: () => Promise<string>, assertBase: (previous: string) => Promise<void>,
 * importRelease: () => Promise<unknown>, preparePages: (release: string, changed: boolean) => Promise<unknown>,
 * activate: (release: string, expected: string) => Promise<unknown>,
 * verifyApi: () => Promise<unknown>, publishFrontend: () => Promise<unknown>,
 * restoreRelease: (previous: string, attempted: string) => Promise<unknown> }} actions
 */
export async function deployIndependentFrontend(actions) {
  const previous = await actions.capture();
  if (!releaseIdentity(previous) || !releaseIdentity(actions.releaseId))
    throw new Error('A valid existing API release is required for rollback');
  await actions.assertBase(previous);
  const changesData = previous !== actions.releaseId;
  // Failed immutable imports and page preparation have no public effect.
  if (changesData) await actions.importRelease();
  await actions.preparePages(actions.releaseId, changesData);
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

/**
 * Prepared pages must be complete before any revision gets traffic. A new
 * release, or one without pages (backfilled here), is verified against every
 * stored document. The unchanged published release, whose manifest an earlier
 * publication verified, gets bounded checks only: its manifest still binds the
 * same records and contract, and the public API serves representative pages.
 * @param {{ changed: boolean, meta: Record<string, any> | undefined, manifestKey: string, schema: string,
 *   backfill: () => Promise<unknown>, verifyStored: () => Promise<unknown>, probe: () => Promise<unknown> }} options
 */
export async function preparePages({ changed, meta, manifestKey, schema, backfill, verifyStored, probe }) {
  const manifest = meta?.[manifestKey];
  if (!manifest) {
    await backfill();
    return verifyStored();
  }
  if (changed) return verifyStored();
  if (manifest.schema_version !== schema || manifest.records_digest !== meta.records_digest || !Number.isInteger(manifest.count) ||
      meta.state !== 'ready' || !meta.published_at)
    throw new Error('Published release pages do not match their manifest; run a full publication');
  return probe();
}

/** Reads representative prepared pages through the public API, as the frontend will. */
export async function probePages(release, samples, { fetchImpl = fetch } = {}) {
  for (const pathname of samples) {
    const [, , kind, id] = pathname.split('/');
    if (kind !== 'result' && kind !== 'evaluation') continue;
    const input = encodeURIComponent(JSON.stringify({ release_id: release, kind, id }));
    const response = await fetchWithRetry(`${CATALOGUE_API}/api/trpc/catalogue.page?input=${input}&verify=${Date.now()}`, {
      fetchImpl, redirect: 'manual', timeoutMs: 120_000, expectedContentType: 'application/json', headers: { 'Cache-Control': 'no-cache' },
    });
    const page = response.status === 200 ? (await response.json()).result?.data : undefined;
    if (page?.release_id !== release || page?.route_kind !== kind || page?.detail?.record?.id !== id)
      throw new Error(`Prepared page ${kind}/${id} is not served for ${release} (${response.status})`);
  }
}

/** Cloud Run first, then the edge; an edge failure moves traffic back to the previous revision. */
export async function publishFrontend({ deployRevision, publishEdge }) {
  const revision = await deployRevision();
  try { await publishEdge(revision); }
  catch (cause) {
    try { await revision.rollback(); }
    catch (error) { throw new AggregateError([cause, error], 'Frontend publication failed and Cloud Run rollback needs operator attention'); }
    throw new Error(`Frontend publication failed; traffic restored to ${revision.previous}.`, { cause });
  }
  return revision;
}

/** One result and one evaluation page of the pinned release, for candidate checks. */
export function candidateSamples(catalogue) {
  const live = catalogue.records.filter(record => record.status !== 'excluded');
  return ['result', 'evaluation', 'model', 'benchmark'].map(kind => {
    const record = live.find(item => item.kind === kind);
    if (!record) throw new Error(`The pinned release has no ${kind} record to verify`);
    return `/database/${kind}/${record.id}/`;
  });
}

async function checkedInputs() {
  const plan = JSON.parse(await readFile('workbench/deployment-plan.json', 'utf8'));
  const receipt = JSON.parse(await readFile(RECEIPT_FILE, 'utf8'));
  const manifestBytes = await readFile('public/omics/manifest.json');
  const manifest = JSON.parse(manifestBytes.toString());
  const pin = JSON.parse(await readFile('benchmark-data.lock.json', 'utf8'));
  if (!validReceipt(receipt) || !['web', 'full'].includes(plan.mode) ||
      receipt.producer_repository !== pin.repository || receipt.producer_revision !== pin.revision || receipt.release_id !== pin.release_id ||
      receipt.producer_manifest_sha256 !== pin.manifest_sha256 ||
      receipt.commit !== plan.commit || receipt.release_id !== manifest.release_id ||
      receipt.manifest_sha256 !== createHash('sha256').update(manifestBytes).digest('hex') ||
      receipt.frontend_version !== (plan.frontend === false ? plan.previous?.frontend_version : plan.commit) ||
      JSON.stringify(receipt.fingerprints) !== JSON.stringify(plan.fingerprints) ||
      JSON.stringify(await fingerprints()) !== JSON.stringify(plan.fingerprints))
    throw new Error('Independent publication does not match checked source and catalogue');
  return { plan, receipt, pin };
}

export async function main(args = process.argv.slice(2)) {
  const { plan, receipt, pin } = await checkedInputs();
  const previous = await currentApiRelease();
  const changesData = previous !== receipt.release_id;
  if (args.includes('--inspect')) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
      `data_required=${changesData}\nbackend_required=${Boolean(plan.backend)}\napi_release_id=${previous}\n`);
    console.log(`Catalogue import ${changesData ? 'required' : 'unchanged'}; frontend release ${receipt.release_id}`);
    return;
  }
  // Cloud Run publication and page readiness both use Google credentials.
  if (process.env.GCLOUD_PROJECT !== 'rewire-it' || process.env.NODE_ENV !== 'production')
    throw new Error('Publication requires the explicit production project and environment');
  if (changesData || plan.backend) await run(['node', 'scripts/backend-deployment.mjs', '--assert']);
  else if (!validReceipt(plan.previous) || plan.previous.fingerprints.backend !== plan.fingerprints.backend)
    throw new Error('Frontend-only deployment requires a checked matching backend receipt');
  const cloudRun = cloudRunConfig();
  const edge = edgeConfig();
  const samples = candidateSamples(JSON.parse(await readFile('public/omics/catalogue.json', 'utf8')));
  const contributionArgument = `--contributions=${contributionProbeMode()}`;
  const acceptance = changesData || plan.backend ? 'full' : liveAcceptanceProfile(plan);
  // One lazy Admin instance survives activation and potential rollback.
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
    async preparePages(release, changed) {
      // A release imported before pages existed is backfilled from its own bytes.
      const { RECORD_PAGE_MANIFEST, verifyStoredRecordPages } = await import('../services/omics/dist/record-page-store.js');
      const { RECORD_PAGE_SCHEMA } = await import('../services/omics/dist/record-pages.js');
      const db = await dataDatabase();
      const ref = db.collection('catalogueReleases').doc(release);
      await preparePages({
        changed, meta: (await ref.get()).data(), manifestKey: RECORD_PAGE_MANIFEST, schema: RECORD_PAGE_SCHEMA,
        backfill: () => measure('catalogue.page_backfill', () => run(['node', '--import', 'tsx', 'services/omics/src/import-cli.ts',
          '--pages', 'public/omics/catalogue.json', 'public/omics/manifest.json'])),
        verifyStored: () => measure('catalogue.page_verification', async () => verifyStoredRecordPages(ref, (await ref.get()).data())),
        probe: () => measure('catalogue.page_probe', () => probePages(release, samples)),
      });
    },
    async activate(release, expected) {
      const { activateRelease } = await import('../services/omics/dist/catalogue-service.js');
      const db = await dataDatabase();
      await measure('catalogue.activation', () => activateRelease(db, release, { expectedPreviousReleaseId: expected }));
    },
    verifyApi: () => measure('catalogue.api_verification', () => run(['node', 'scripts/check-live-catalogue.mjs',
      CATALOGUE_API, contributionArgument, `--acceptance=${acceptance}`])),
    publishFrontend: () => publishFrontend({
      async deployRevision() {
        if (await currentApiRelease() !== receipt.release_id)
          throw new Error('API publication changed before frontend deployment; refusing a mismatched publication');
        return measure('frontend.cloud_run', () => deployCloudRun({ config: cloudRun, plan, receipt, pin, samples }));
      },
      publishEdge: revision => publishEdge({ config: edge, frontend: revision.url, deployWorker: Boolean(plan.edge), acceptance }),
    }),
    async restoreRelease(oldRelease, attempted) {
      const db = await dataDatabase();
      await measure('catalogue.rollback', () => restorePublicationPointer(db, oldRelease, attempted));
    },
  }); } finally { if (dataDb) await dataDb.terminate(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
