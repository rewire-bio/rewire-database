// Edge cache policy for the public frontend, shared by the Cloudflare Worker
// and the frontend server's entrypoint. The cache only accelerates: a miss or
// an eviction renders the page again on Cloud Run from the same pinned release.

const FRONTEND_VERSION = /^[a-f0-9]{40}$/;
const DATA_RELEASE = /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/;
// Entries are keyed by frontend and data identity, so a long edge lifetime
// never serves another build. Browsers always revalidate HTML.
export const EDGE_TTL_SECONDS = 7 * 24 * 60 * 60;
/** How long a Worker keeps using the identity it last saw from the origin. */
export const IDENTITY_TTL_MS = 60_000;
const PRIVATE_PREFIXES = ["/contribute", "/_analytics", "/api", "/__/auth", "/omics", "/benchmark-literature"];
const UNCACHED_FILES = new Set(["/deployment.json", "/release-manifest.json"]);
// Request headers that make a Next.js request an RSC payload, a prefetch, an
// intercepted route or a server action rather than a full HTML document.
const RSC_HEADERS = ["rsc", "next-router-state-tree", "next-router-prefetch", "next-url", "next-action"];
const PERSONAL_HEADERS = ["authorization", "cookie"];
const CACHEABLE_TYPES = /^(text\/html|text\/css|text\/plain|text\/javascript|application\/javascript|application\/xml|text\/xml|application\/atom\+xml|image\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+)\s*(;|$)/i;

const privatePath = pathname => UNCACHED_FILES.has(pathname) ||
  PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));

/**
 * Anonymous public GET of a page or asset. Both the origin (to opt a response
 * in) and the Worker (to look one up) use this; anything personal, mutating,
 * private or RSC bypasses the cache.
 * @param {{ method: string, url: URL, header: (name: string) => string | null | undefined }} request
 */
export function publicRequest({ method, url, header }) {
  return method === "GET" &&
    !PERSONAL_HEADERS.some(name => header(name)) &&
    !RSC_HEADERS.some(name => header(name)) &&
    !url.searchParams.has("_rsc") &&
    !privatePath(url.pathname);
}
export function cacheableRequest(request) {
  return publicRequest({ method: request.method, url: new URL(request.url), header: name => request.headers.get(name) });
}

/** The frontend version and data release an origin response was rendered from. */
export function responseIdentity(response) {
  const frontend = response.headers.get("x-rewire-frontend") || "";
  const release = response.headers.get("x-rewire-data-release") || "";
  return FRONTEND_VERSION.test(frontend) && DATA_RELEASE.test(release) ? { frontend, release } : null;
}

/** Frontend version + pinned data release + the exact public URL. */
export function cacheKey(request, identity) {
  const url = new URL(request.url);
  url.searchParams.append("__rewire_cache", `${identity.frontend}.${identity.release}`);
  return new Request(url.href, { method: "GET" });
}

/**
 * Stored only when the origin explicitly opted the response in, and only for
 * a successful, cookie-free HTML or static asset response of that identity.
 * Next marks dynamic HTML private/no-store by default; the opt-in header is
 * the reviewed contract that overrides it for anonymous public pages.
 */
export function storableResponse(response, identity) {
  const found = responseIdentity(response);
  return response.status === 200 &&
    response.headers.get("x-rewire-edge-cache") === "public" &&
    !response.headers.has("set-cookie") &&
    CACHEABLE_TYPES.test(response.headers.get("content-type") || "") &&
    knownVariation(response.headers.get("vary")) &&
    !!found && found.frontend === identity.frontend && found.release === identity.release;
}

// The key is URL plus identity, so a response may vary only on request headers
// that already exclude a request from the cache (Next navigation headers) or
// that the Cache API normalizes itself (Accept-Encoding). Anything else,
// including "*", means the stored copy could be served to the wrong request.
const KEYED_VARY = new Set([...RSC_HEADERS, "accept-encoding"]);
export function knownVariation(vary) {
  return (vary || "").split(",").map(name => name.trim().toLowerCase()).filter(Boolean).every(name => KEYED_VARY.has(name));
}

export function edgeCopy(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${EDGE_TTL_SECONDS}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Content-addressed chunks are immutable; every other cached response revalidates. */
export function browserResponse(response, pathname, status) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", pathname.startsWith("/_next/static/")
    ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
  headers.set("X-Rewire-Cache", status);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
