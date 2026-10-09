import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// shared/omics mirrors rewire-benchmark-data's services/omics/src (record
// validation, query engine and prepared-file reader) as of the release the lock pins. Run it
// when adopting a release, from a producer checkout at that release's revision;
// never edit the mirror here.
//   npm run shared:sync -- /path/to/rewire-benchmark-data
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'shared/omics');

export function syncShared(producer) {
  // The producer keeps the historical folder name; accept shared/omics too if it is renamed.
  const source = ['shared/omics', 'services/omics/src'].map(dir => path.join(producer, dir)).find(dir => fs.existsSync(dir));
  if (!source) throw new Error(`No shared code in ${producer}`);
  const files = fs.readdirSync(source).filter(name => name.endsWith('.ts'));
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(target)) if (!files.includes(name)) fs.rmSync(path.join(target, name));
  for (const name of files) fs.copyFileSync(path.join(source, name), path.join(target, name));
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const producer = process.argv[2] || process.env.BENCHMARK_DATA_SOURCE;
  if (!producer) throw new Error('Usage: npm run shared:sync -- /path/to/rewire-benchmark-data');
  console.log(`Copied ${syncShared(path.resolve(producer)).length} files into shared/omics`);
}
