import { readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Independent of Hosting rollback: mark dirty BEFORE any Functions/rules write. */
export function backendCurrent(marker, fingerprint) {
  return /^[a-f0-9]{64}$/.test(fingerprint) && marker?.schema === 1 &&
    marker.state === 'ready' && marker.fingerprint === fingerprint;
}
export async function beginBackend(ref, fingerprint, owner) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || !owner) throw new Error('Invalid backend deployment identity');
  await ref.set({ schema: 1, state: 'deploying', fingerprint, owner });
}
export async function completeBackend(db, ref, fingerprint, owner) {
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.state !== 'deploying' || current.fingerprint !== fingerprint || current.owner !== owner)
      throw new Error('Backend deployment ownership changed');
    tx.set(ref, { ...current, state: 'ready' });
  });
}
async function main() {
  if (process.env.GCLOUD_PROJECT !== 'rewire-it' || process.env.NODE_ENV !== 'production')
    throw new Error('Backend deployment state requires the explicit production project');
  const plan = JSON.parse(await readFile('workbench/deployment-plan.json', 'utf8'));
  const fingerprint = plan.fingerprints.backend;
  const owner = `${process.env.GITHUB_RUN_ID || 'operator'}:${process.env.GITHUB_RUN_ATTEMPT || '1'}:${plan.commit}`;
  const { firebase } = await import('../services/omics/dist/firebase.js');
  const db = firebase().db;
  // Existing deny-all client rules keep this operational receipt private. Uses
  // the same existing deployment identity as the catalogue importer; no new IAM.
  const ref = db.doc('deploymentState/backend');
  try {
    if (process.argv.includes('--begin')) await beginBackend(ref, fingerprint, owner);
    else if (process.argv.includes('--complete')) await completeBackend(db, ref, fingerprint, owner);
    else {
      const required = plan.force_full || !backendCurrent((await ref.get()).data(), fingerprint);
      if (process.argv.includes('--assert')) {
        if (!backendCurrent((await ref.get()).data(), fingerprint)) throw new Error('Backend has no matching completed deployment');
      } else {
        if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `required=${Boolean(required)}\n`);
        console.log(`Backend deployment: ${required ? 'required' : 'verified unchanged'}`);
      }
    }
  } finally { await db.terminate(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
