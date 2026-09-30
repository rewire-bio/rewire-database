// All origins are fixed: request paths can never select an arbitrary backend.
export const FIREBASE_ORIGIN = "https://rewire-it.web.app";
export const PROXY_PREFIXES = ["/omics", "/api", "/__/auth", "/database/result", "/database/evaluation"];
export function isProxied(pathname) {
  return PROXY_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

