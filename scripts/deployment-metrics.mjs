import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const STAGE = /^[a-z][a-z0-9_.-]{0,79}$/;
const COUNTERS = ['files', 'bytes', 'compressed_bytes', 'uploaded_bytes', 'uploaded_files', 'exit_code'];

/** Receipts deliberately exclude commands, arguments, URLs, environments and errors. */
export function createDeploymentMetrics({ file = process.env.DEPLOYMENT_METRICS_FILE,
  clock = () => performance.now(), now = () => new Date().toISOString() } = {}) {
  async function measure(stage, action, details = {}) {
    if (!STAGE.test(stage)) throw new Error('Invalid deployment metrics stage');
    if (!file) return action();
    const started = clock();
    const startedAt = now();
    let status = 'failed';
    try { const result = await action(); status = 'success'; return result; }
    finally {
      const record = { schema: 1, stage, status, started_at: startedAt, elapsed_ms: Math.max(0, clock() - started) };
      for (const key of COUNTERS) if (Number.isFinite(details[key]) && details[key] >= 0) record[key] = details[key];
      // Telemetry must never convert a successful release into a rollback.
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      } catch { console.warn('Deployment metrics receipt could not be written'); }
    }
  }
  return { measure };
}
export const measureDeploymentStage = (stage, action, details) => createDeploymentMetrics().measure(stage, action, details);

export function metricsSummary(records) {
  const totals = new Map();
  for (const record of records) {
    if (record.schema !== 1 || !STAGE.test(record.stage) || !['success', 'failed'].includes(record.status) ||
      !Number.isFinite(record.elapsed_ms) || record.elapsed_ms < 0) throw new Error('Invalid deployment metrics receipt');
    const total = totals.get(record.stage) || { elapsed_ms: 0, runs: 0, failures: 0, bytes: 0, files: 0 };
    total.elapsed_ms += record.elapsed_ms; total.runs++; total.failures += Number(record.status === 'failed');
    total.bytes += record.uploaded_bytes ?? record.compressed_bytes ?? record.bytes ?? 0;
    total.files += record.uploaded_files ?? record.files ?? 0;
    totals.set(record.stage, total);
  }
  return ['### Deployment timings', '', 'Durations include retries. Nested stages overlap; do not sum all rows.', '',
    '| Stage | Seconds | Runs | Failures | Files | Bytes |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...[...totals].map(([stage, t]) => `| ${stage} | ${(t.elapsed_ms / 1000).toFixed(2)} | ${t.runs} | ${t.failures} | ${t.files} | ${t.bytes} |`), ''].join('\n');
}

async function main(args) {
  const file = process.env.DEPLOYMENT_METRICS_FILE || 'workbench/deployment-metrics.jsonl';
  if (args[0] === 'summary' && args.length === 1) {
    let source;
    try { source = await readFile(file, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; source = ''; }
    const summary = metricsSummary(source.trim() ? source.trim().split('\n').map(line => JSON.parse(line)) : []);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    return;
  }
  if (args[0] !== 'run' || args[2] !== '--' || !args[3]) throw new Error('Usage: deployment-metrics.mjs run <stage> -- <command> [args...] | summary');
  const details = {};
  await createDeploymentMetrics({ file }).measure(args[1], async () => {
    details.exit_code = await new Promise((resolve, reject) => {
      const child = spawn(args[3], args.slice(4), { stdio: 'inherit' });
      child.on('error', () => reject(new Error('Deployment stage command could not start')));
      child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    });
    process.exitCode = details.exit_code;
    if (details.exit_code !== 0) throw new Error('Deployment stage command failed');
  }, details);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(() => { console.error('Deployment metrics command failed'); process.exitCode ||= 1; });
