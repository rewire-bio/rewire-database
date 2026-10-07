import { execFileSync } from 'node:child_process';
import { readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { publishedReceipt, validReceipt, publicBytes, classify } from './deployment-plan.mjs';
import { createHash } from 'node:crypto';

export function publicationDecision(commit, latest, plan) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(latest) || plan.commit !== commit)
    throw Error('Publication source identity is invalid');
  return { publish: commit === latest, reason: commit === latest ? 'current' : 'superseded' };
}
export async function assertPublicationBase(plan, { receipt = publishedReceipt, bytes = publicBytes } = {}) {
  const current = await receipt();
  if (validReceipt(plan.previous)) {
    if (!current) throw Error('Live publication receipt is unavailable');
    const same = JSON.stringify(current) === JSON.stringify(plan.previous);
    const original = !same && plan.mode === 'web' && plan.backend === false && plan.fingerprints
      ? classify(plan.fingerprints, plan.previous, plan.force_full) : null;
    const compatibleUi = original?.mode === 'web' && original.backend === false && validReceipt(current) &&
      current.release_id === plan.previous.release_id && current.manifest_sha256 === plan.previous.manifest_sha256 &&
      ['data', 'backend', 'hosting'].every(key => current.fingerprints[key] === plan.fingerprints[key]);
    if (!same && !compatibleUi)
      throw Error('Live publication changed during build; rebuild against the current release before publishing');
    const manifest = await bytes('omics/manifest.json');
    if (createHash('sha256').update(manifest).digest('hex') !== current.manifest_sha256)
      throw Error('Live manifest does not match its publication receipt');
    return same ? plan : { ...plan, previous: current };
  } else {
    // Bootstrap remains a full transaction with rollback targets captured by deployCatalogue.
    // A newly available receipt means this build lost the race and must be replanned.
    if (plan.mode !== 'full' || current) throw Error('Publication base changed or is missing');
    return plan;
  }
}
async function main() {
  const plan = JSON.parse(await readFile('workbench/deployment-plan.json', 'utf8'));
  // Fetch only Git metadata. No source resets, credentials or production writes.
  execFileSync('git', ['fetch', '--no-tags', 'origin', 'main'], { stdio: 'inherit' });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const latest = execFileSync('git', ['rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim();
  const decision = publicationDecision(commit, latest, plan);
  if (decision.publish) {
    const checked = await assertPublicationBase(plan);
    if (process.argv.includes('--refresh-ui-base') && checked !== plan) {
      await writeFile('workbench/deployment-plan.json', JSON.stringify(checked, null, 2) + '\n');
      console.log('Retargeted checked UI bytes to the verified unchanged live catalogue/backend');
    }
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `publish=${decision.publish}\n`);
  if (!decision.publish && process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, '\nPublication skipped: a newer main commit superseded this checked build. No production writes were made.\n');
  console.log(`Publication: ${decision.reason}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
