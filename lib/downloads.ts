import lock from '../benchmark-data.lock.json';
import locations from './generated-download-locations.json';

if (locations.revision !== lock.revision || locations.manifest_sha256 !== lock.manifest_sha256 || locations.repository !== lock.repository) {
  throw new Error('Download locations are stale. Run npm run data:prepare.');
}
const urls = new Map<string, string>();
for (const group of locations.groups) {
  for (const file of group.files) {
    urls.set(`${group.destination}/${file}`, `https://raw.githubusercontent.com/${locations.repository}/${locations.revision}/${group.source}/${encodeURIComponent(file)}.gz`);
  }
}
/** Exact producer-manifest mapping; exports on GitHub are gzip compressed. */
export function githubDownloadUrl(value: string): string {
  const mapped = optionalGithubDownloadUrl(value);
  if (!mapped) throw new Error(`Download is absent from the pinned producer manifest: ${value}`);
  return mapped;
}
export function optionalGithubDownloadUrl(value: string): string | undefined {
  let pathname = value;
  if (/^https?:/.test(value)) {
    let url: URL;
    try { url = new URL(value); } catch { return; }
    if (!['benchmarks.rewire.it', 'benchmarks.rewirebio.io', 'rewire-omics.web.app', 'rewire-omics.firebaseapp.com'].includes(url.hostname)) return;
    pathname = url.pathname;
  }
  return urls.get(pathname);
}
