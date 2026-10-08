// Download links are site paths, identical in server and browser renders. The
// frontend redirects each to the exact gzip export named by the running
// revision's pinned producer manifest (app/omics, app/benchmark-literature),
// so links follow a data release without rebuilding the frontend.
const SITE_HOSTS = ["benchmarks.rewire.it", "benchmarks.rewirebio.io", "rewire-omics.web.app", "rewire-omics.firebaseapp.com"];
const DOWNLOAD_PATH = /^\/(?:omics|benchmark-literature)\/[A-Za-z0-9._/-]+$/;

export function isDownloadPath(pathname: string): boolean {
  return DOWNLOAD_PATH.test(pathname) && !pathname.split("/").some((part) => part === "." || part === "..");
}

/** The site path of a published export. */
export function downloadHref(value: string): string {
  const href = optionalDownloadHref(value);
  if (!href) throw new Error(`Not a published download path: ${value}`);
  return href;
}

/** Site path for our own download URLs or paths; undefined for anything else. */
export function optionalDownloadHref(value: string): string | undefined {
  let pathname = value;
  if (/^https?:/.test(value)) {
    let url: URL;
    try { url = new URL(value); } catch { return; }
    if (!SITE_HOSTS.includes(url.hostname)) return;
    pathname = url.pathname;
  }
  return isDownloadPath(pathname) ? pathname : undefined;
}
