import fs from 'node:fs';
import path from 'node:path';

/** Only receipted historical files may be absent from a current-only export.
 * Current files and arbitrary broken links always remain validation failures.
 */
export function historicalExportPaths(currentId, root = 'data/omics/releases') {
  const paths = new Set();
  for (const name of fs.readdirSync(root)) {
    if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}\.json$/.test(name)) continue;
    const id = name.slice(0, -5);
    if (id === currentId) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    if (manifest.release_id !== id) throw new Error(`Historical receipt ID mismatch: ${name}`);
    for (const file of ['manifest.json', ...Object.keys(manifest.files)]) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file)) throw new Error(`Invalid historical filename: ${file}`);
      paths.add(`/omics/releases/${id}/${file}`);
    }
  }
  return paths;
}
