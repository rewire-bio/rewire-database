import firebase from "../firebase.json" with { type: "json" };
import { FIREBASE_ORIGIN, isProxied } from "./routing.mjs";

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
    if (!isProxied(url.pathname)) {
      const asset = await env.ASSETS.fetch(request);
      // Firebase detail pages are published first. During rollout/rollback their
      // content-addressed chunks may be newer than this Worker's asset version.
      if (asset.status !== 404) return asset;
      if (!url.pathname.startsWith("/_next/static/")) {
        const missing = await env.ASSETS.fetch(new Request(new URL("/404", request.url), request));
        return new Response(missing.body, { status: 404, headers: missing.headers });
      }
    }
    const upstream = new URL(url.pathname + url.search, FIREBASE_ORIGIN);
    // Cloudflare's production origin fetch can negotiate a compressed range
    // despite identity being requested. Let Firebase serve public byte ranges
    // directly until the origin guarantees uncompressed partial responses.
    if ((url.pathname === "/omics" || url.pathname.startsWith("/omics/")) &&
      ["GET", "HEAD"].includes(request.method) && request.headers.has("range")) {
      return new Response(null, { status: 307, headers: {
        Location: upstream.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      } });
    }
    const privateRequest = url.pathname === "/api" || url.pathname.startsWith("/api/") ||
      url.pathname === "/__/auth" || url.pathname.startsWith("/__/auth/") ||
      request.headers.has("authorization") || request.headers.has("cookie");
    const forwarded = new Request(upstream, request);
    forwarded.headers.delete("host");
    // Range offsets and immutable checksums refer to the original bytes.
    forwarded.headers.set("accept-encoding", "identity");
    // Never follow an upstream redirect carrying a user's credentials.
    const response = await fetch(forwarded, {
      redirect: "manual",
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (url.pathname.startsWith("/_next/static/") && response.ok &&
      response.headers.get("content-type")?.includes("text/html")) {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers(response.headers);
    if (privateRequest || headers.has("set-cookie")) {
      headers.set("Cache-Control", "no-store");
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
    // Stream complete exports. Public ranges are redirected above. No parsing, compression,
    // scientific-record transformation, or Cache API storage is performed here.
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
