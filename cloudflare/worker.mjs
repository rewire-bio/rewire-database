import firebase from "../firebase.json" with { type: "json" };
import { FUNCTIONS_ORIGIN, FUNCTIONS_PATH, AUTH_ORIGIN, backendUrl, isDownload, isProxied } from "./routing.mjs";
import { IDENTITY_TTL_MS, browserResponse, cacheableRequest, cacheKey, edgeCopy, privatePath, responseIdentity, storableResponse } from "./page-cache.mjs";

// The Worker carries no data release. Pages, assets and download redirects
// come from the frontend server on Cloud Run, whose revision fixes the data
// pin; the cache identity is whatever that origin last reported.
let observed = null;
export function resetObservedIdentity() { observed = null; }

// Upstream requests always reach the origin: cache "no-store" bypasses
// Cloudflare's CDN cache for these non-Cloudflare origins. Public HTML is
// cached only by this Worker, under the frontend version and data release.
export const UPSTREAM_FETCH = { redirect: "manual", cache: "no-store" };
/** The reviewed contract for private, API, download and metadata responses. */
function noStore(headers) {
  headers.set("Cache-Control", "no-store");
  headers.delete("CDN-Cache-Control");
  headers.delete("Cloudflare-CDN-Cache-Control");
}

function frontendOrigin(env) {
  let origin;
  try { origin = new URL(env.FRONTEND_ORIGIN); } catch { return null; }
  if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search) return null;
  return origin.origin;
}

async function frontend(request, env, ctx, url) {
  const origin = frontendOrigin(env);
  if (!origin) return new Response("Frontend origin is not configured", { status: 503, headers: { "Cache-Control": "no-store" } });
  const cacheable = cacheableRequest(request);
  if (cacheable && observed && observed.expires > Date.now()) {
    const hit = await caches.default.match(cacheKey(request, observed.identity)).catch(() => undefined);
    if (hit) return browserResponse(hit, url.pathname, "HIT");
  }
  const upstream = new URL(url.pathname + url.search, origin);
  const forwarded = new Request(upstream, request);
  forwarded.headers.delete("host");
  // Download redirects need no credentials; never pass them along.
  if (isDownload(url.pathname)) for (const name of ["cookie", "authorization"]) forwarded.headers.delete(name);
  const response = await fetch(forwarded, UPSTREAM_FETCH);
  const headers = new Headers(response.headers);
  if (privatePath(url.pathname)) noStore(headers);
  const location = headers.get("location");
  if (location) {
    const destination = new URL(location, upstream);
    if (destination.origin === origin) {
      destination.protocol = url.protocol;
      destination.host = url.host;
      headers.set("location", destination.href);
    }
  }
  const result = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  const identity = responseIdentity(result);
  if (identity) observed = { identity, expires: Date.now() + IDENTITY_TTL_MS };
  if (!cacheable || !identity || !storableResponse(result, identity)) {
    result.headers.set("X-Rewire-Cache", "BYPASS");
    return result;
  }
  // The cache only accelerates: a failed write must not fail a healthy response.
  const stored = caches.default.put(cacheKey(request, identity), edgeCopy(result.clone())).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(stored); else await stored;
  return browserResponse(result, url.pathname, "MISS");
}

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const legacy = firebase.hosting.redirects.find(rule => {
      const source = rule.source.replace("{,/}", "");
      return url.pathname === source || url.pathname === `${source}/`;
    });
    if (legacy) {
      const destination = new URL(legacy.destination, url.origin);
      if (url.search) destination.search += (destination.search ? "&" : "?") + url.search.slice(1);
      return Response.redirect(destination.href, legacy.type);
    }
    // Downloads are redirects to exact GitHub exports; bodies are never forwarded.
    if (isDownload(url.pathname) && !["GET", "HEAD"].includes(request.method)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    if (!isProxied(url.pathname)) return frontend(request, env, ctx, url);
    const upstream = backendUrl(url);
    const forwarded = new Request(upstream, request);
    forwarded.headers.delete("host");
    const response = await fetch(forwarded, UPSTREAM_FETCH);
    const headers = new Headers(response.headers);
    noStore(headers);
    const location = headers.get("location");
    if (location) {
      const destination = new URL(location, upstream);
      if (destination.origin === AUTH_ORIGIN || (destination.origin === FUNCTIONS_ORIGIN && destination.pathname.startsWith(`${FUNCTIONS_PATH}/`))) {
        if (destination.origin === FUNCTIONS_ORIGIN) destination.pathname = destination.pathname.slice(FUNCTIONS_PATH.length);
        destination.protocol = url.protocol;
        destination.host = url.host;
        headers.set("location", destination.href);
      }
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
export default worker;
