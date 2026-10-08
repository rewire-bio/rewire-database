import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareBenchmarkData } from './prepare-benchmark-data.mjs';
import { downloadLocations } from './download-locations.mjs';

export { downloadLocations };

export function generateDownloadLocations(root = process.cwd(), source) {
  const index = process.argv.indexOf('--source');
  source ??= index >= 0 ? process.argv[index + 1] : process.env.BENCHMARK_DATA_SOURCE || 'workbench/benchmark-data';
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'benchmark-data.lock.json'), 'utf8'));
  const bytes = fs.readFileSync(path.resolve(root, source, 'website/manifest.json'));
  const result = downloadLocations(lock, bytes);
  fs.writeFileSync(path.join(root, 'lib/generated-download-locations.json'), JSON.stringify(result));
  return result;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.includes('--prepare')) await prepareBenchmarkData();
    generateDownloadLocations();
    console.log('Generated pinned GitHub download locations.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
