// Origins are fixed; request paths cannot select an arbitrary backend.
export const FUNCTIONS_ORIGIN = "https://europe-west2-rewire-it.cloudfunctions.net";
export const FUNCTIONS_PATH = "/contributions";
// Firebase Auth's hosted helper remains infrastructure for email-link sign-in.
// It is independent of our website Hosting deployment and contains no archive.
export const AUTH_ORIGIN = "https://rewire-it.firebaseapp.com";
export const PROXY_PREFIXES = ["/api", "/__/auth"];
export function isProxied(pathname) {
  return PROXY_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
export function isDownload(pathname) {
  return pathname === "/omics" || pathname.startsWith("/omics/") || pathname === "/benchmark-literature" || pathname.startsWith("/benchmark-literature/");
}
export function backendUrl(url) {
  const api = url.pathname === "/api" || url.pathname.startsWith("/api/");
  return new URL((api ? FUNCTIONS_PATH : "") + url.pathname + url.search, api ? FUNCTIONS_ORIGIN : AUTH_ORIGIN);
}
