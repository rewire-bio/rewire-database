import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RECEIPT_FILE, fingerprints, liveAcceptanceProfile, publishedReceipt, validReceipt } from './deployment-plan.mjs';
import { measureDeploymentStage as measure } from './deployment-metrics.mjs';
import { cloudRunConfig, command as run, deployCloudRun } from './deploy-cloud-run.mjs';
import { edgeConfig, publishEdge } from './deploy-cloudflare.mjs';

// Publication: the image embeds its data release and serves the pages and the
// public catalogue API, so there is no data import or activation. Cloud Run
// gets a verified candidate revision, then traffic, then the edge publishes
// and public acceptance runs; a failure there moves traffic back.

/** Cloud Run first, then the edge; an edge failure moves traffic back to the previous revision. */
export async function publishFrontend({ deployRevision, publishEdge }) {
  const revision = await deployRevision();
  try { await publishEdge(revision); }
  catch (cause) {
    try { await revision.rollback(); }
    catch (error) { throw new AggregateError([cause, error], 'Frontend publication failed and Cloud Run rollback needs operator attention'); }
    throw new Error(`Frontend publication failed; traffic restored to ${revision.previous}.`, { cause });
  }
  // Housekeeping only: an accepted publication stays published if pruning fails.
  if (revision.prune) {
    try {
      const pruned = await revision.prune();
      console.log(`Pruned ${pruned.revisions.length} old revisions and ${pruned.tags.length} tags; kept ${revision.revision} and ${revision.previous}.`);
    } catch (error) { console.warn(`Revision pruning failed: ${error.message}`); }
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
  const { plan, receipt } = await checkedInputs();
  if (args.includes('--inspect')) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `backend_required=${Boolean(plan.backend)}\n`);
    console.log(`Frontend release ${receipt.release_id}; backend ${plan.backend ? 'required' : 'unchanged'}`);
    return;
  }
  if (process.env.GCLOUD_PROJECT !== 'rewire-it' || process.env.NODE_ENV !== 'production')
    throw new Error('Publication requires the explicit production project and environment');
  if (plan.backend) await run(['node', 'scripts/backend-deployment.mjs', '--assert']);
  else if (!validReceipt(plan.previous) || plan.previous.fingerprints.backend !== plan.fingerprints.backend)
    throw new Error('Frontend-only deployment requires a checked matching backend receipt');
  const cloudRun = cloudRunConfig();
  const edge = edgeConfig();
  const samples = candidateSamples(JSON.parse(await readFile('public/omics/catalogue.json', 'utf8')));
  const acceptance = plan.mode === 'full' || plan.backend ? 'full' : liveAcceptanceProfile(plan);
  if (validReceipt(plan.previous) && JSON.stringify(await publishedReceipt()) !== JSON.stringify(plan.previous))
    throw new Error('Frontend publication changed during preparation; rebuild before publishing');
  await publishFrontend({
    deployRevision: () => measure('frontend.cloud_run', () => deployCloudRun({ config: cloudRun, plan, receipt, samples })),
    publishEdge: revision => publishEdge({ config: edge, frontend: revision.url, deployWorker: Boolean(plan.edge), acceptance }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
