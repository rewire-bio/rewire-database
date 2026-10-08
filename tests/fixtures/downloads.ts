// Synthetic UI fixtures intentionally use invented releases. Production mapping
// remains fail-closed; this mock models a pinned producer without network IO.
export function githubDownloadUrl(value: string): string {
  const pathname = /^https?:/.test(value) ? new URL(value).pathname : value;
  return `https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/${'a'.repeat(40)}/website/files/public${pathname}.gz`;
}
export function optionalGithubDownloadUrl(value: string): string | undefined {
  if (value.startsWith('/omics/')) return githubDownloadUrl(value);
  try {
    const url = new URL(value);
    if (url.hostname === 'benchmarks.rewirebio.io' && url.pathname.startsWith('/omics/')) return githubDownloadUrl(value);
  } catch { /* External or non-URL fixture. */ }
}
