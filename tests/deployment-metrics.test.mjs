import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDeploymentMetrics, metricsSummary } from '../scripts/deployment-metrics.mjs';

async function fixture(action) {
  const root = await mkdtemp(path.join(tmpdir(), 'deploy-metrics-'));
  try { await action(path.join(root, 'metrics.jsonl'), root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('receipts preserve results, count bytes and record failures without sensitive values', () => fixture(async file => {
  let time = 100;
  const metrics = createDeploymentMetrics({ file, clock: () => time, now: () => '2026-10-07T00:00:00.000Z' });
  const details = { files: 2, bytes: 10, token: 'private-token' };
  assert.equal(await metrics.measure('hosting.upload', async () => { time += 25; return 'result'; }, details), 'result');
  const failure = new Error('sensitive request URL and token');
  await assert.rejects(metrics.measure('hosting.upload', async () => { time += 40; throw failure; }), error => error === failure);
  const content = await readFile(file, 'utf8');
  const records = content.trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(({ elapsed_ms, status }) => ({ elapsed_ms, status })), [
    { elapsed_ms: 25, status: 'success' }, { elapsed_ms: 40, status: 'failed' },
  ]);
  assert.equal(records[0].files, 2); assert.equal(records[0].bytes, 10);
  assert.ok(!content.includes('sensitive')); assert.ok(!content.includes('private-token'));
  assert.match(metricsSummary(records), /hosting.upload \| 0.07 \| 2 \| 1 \| 2 \| 10/);
}));

test('telemetry write failures do not change publication result or error', () => fixture(async (file, root) => {
  await writeFile(path.join(root, 'blocked'), 'not a directory');
  const metrics = createDeploymentMetrics({ file: path.join(root, 'blocked/metrics') });
  assert.equal(await metrics.measure('hosting.activation', async () => 'published'), 'published');
  await assert.rejects(metrics.measure('hosting.activation', async () => { throw new Error('activation failed'); }), /activation failed/);
}));

test('disabled receipts run the action, and invalid stage names are rejected', async () => {
  const metrics = createDeploymentMetrics({ file: undefined });
  assert.equal(await metrics.measure('build', async () => 42), 42);
  await assert.rejects(metrics.measure('https://token@example.com', async () => 42), /Invalid/);
  assert.throws(() => metricsSummary([{ schema: 1, stage: '| secret', status: 'success', elapsed_ms: 1 }]), /Invalid/);
});

test('CLI records failed command exit and appends summary without logging argv', () => fixture(async (file, root) => {
  const cli = path.resolve('scripts/deployment-metrics.mjs');
  const env = { ...process.env, DEPLOYMENT_METRICS_FILE: file, GITHUB_STEP_SUMMARY: path.join(root, 'summary') };
  const run = spawnSync(process.execPath, [cli, 'run', 'build', '--', process.execPath, '-e', 'process.exit(7)', 'secret-argument'], { env, encoding: 'utf8' });
  assert.equal(run.status, 7);
  const content = await readFile(file, 'utf8');
  assert.ok(!content.includes('secret-argument'));
  assert.equal(JSON.parse(content).exit_code, 7);
  assert.equal(JSON.parse(content).status, 'failed');
  const summary = spawnSync(process.execPath, [cli, 'summary'], { env, encoding: 'utf8' });
  assert.equal(summary.status, 0);
  assert.match(await readFile(env.GITHUB_STEP_SUMMARY, 'utf8'), /build/);
}));
