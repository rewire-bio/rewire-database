import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// shared/omics mirrors rewire-benchmark-data's shared/omics (record validation,
// query engine and prepared-file reader) as of the release the lock pins. Run it
// when adopting a release, from a producer checkout at that release's revision;
// never edit the mirror here.
//   npm run shared:sync -- /path/to/rewire-benchmark-data
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'shared/omics');

export function syncShared(producer) {
  const source = path.join(producer, 'shared/omics');
  if (!fs.existsSync(source)) throw new Error(`No shared/omics in ${producer}`);
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
