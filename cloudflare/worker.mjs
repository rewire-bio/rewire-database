import firebase from "../firebase.json" with { type: "json" };
// All origins are fixed: request paths can never select an arbitrary backend.
export const FIREBASE_ORIGIN = "https://rewire-it.web.app";
export const PROXY_PREFIXES = ["/omics", "/api", "/__/auth", "/database/result", "/database/evaluation"];
export function isProxied(pathname) {
  return PROXY_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const legacy = firebase.hosting.redirects.find(rule => {
      const source = rule.source.replace("{,/}", "");
      return url.pathname === source || url.pathname === `${source}/`;
    });
    if (legacy) {
      const destination = new URL(legacy.destination, url.origin);
      // Append raw query bytes, including repeated keys, exactly as Firebase does.
      if (url.search) destination.search += (destination.search ? "&" : "?") + url.search.slice(1);
      return Response.redirect(destination.href, legacy.type);
    }
    if (!isProxied(url.pathname)) return env.ASSETS.fetch(request);
    const upstream = new URL(url.pathname + url.search, FIREBASE_ORIGIN);
    const privateRequest = url.pathname === "/api" || url.pathname.startsWith("/api/") ||
      url.pathname === "/__/auth" || url.pathname.startsWith("/__/auth/") ||
      request.headers.has("authorization") || request.headers.has("cookie");
    const forwarded = new Request(upstream, request);
    forwarded.headers.delete("host");
    // Never follow an upstream redirect carrying a user's credentials.
    const response = await fetch(forwarded, {
      redirect: "manual",
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const headers = new Headers(response.headers);
    if (privateRequest || headers.has("set-cookie")) {
      headers.set("Cache-Control", "private, no-store");
      headers.delete("CDN-Cache-Control");
      headers.delete("Cloudflare-CDN-Cache-Control");
    }
    const location = headers.get("location");
    if (location) {
      const destination = new URL(location, upstream);
      if (destination.origin === FIREBASE_ORIGIN) {
        destination.protocol = url.protocol;
        destination.host = url.host;
        headers.set("location", destination.href);
      }
    }
    // Stream exports, including range responses. No parsing, compression,
    // scientific-record transformation, or Cache API storage is performed here.
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
