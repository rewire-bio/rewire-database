import { readFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const artifact = JSON.parse(await readFile('workbench/checked-publication/artifact.json', 'utf8'));
const start = Date.parse(artifact.prepared_at);
if (!Number.isFinite(start) || start > Date.now()) throw Error('Invalid publication readiness timestamp');
const file = process.env.DEPLOYMENT_METRICS_FILE;
if (file) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify({ schema: 1, stage: 'handoff_wait', status: 'success', started_at: artifact.prepared_at,
    elapsed_ms: Date.now() - start }) + '\n', {mode: 0o600});
}
