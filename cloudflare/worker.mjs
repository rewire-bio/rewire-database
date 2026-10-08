import firebase from "../firebase.json" with { type: "json" };
import lock from "../benchmark-data.lock.json" with { type: "json" };
import downloads from "../lib/generated-download-locations.json" with { type: "json" };
import { FUNCTIONS_ORIGIN, FUNCTIONS_PATH, AUTH_ORIGIN, backendUrl, isDownload, isProxied } from "./routing.mjs";

// This checked-in index is derived from the exact producer manifest pinned in
// benchmark-data.lock.json. Only listed exports can become GitHub redirects.
const downloadUrls = new Map();
if (downloads.revision !== lock.revision || downloads.manifest_sha256 !== lock.manifest_sha256) throw new Error("Stale download locations; run npm run data:prepare");
if (downloads.repository !== "rewire-bio/rewire-benchmark-data") throw new Error("Unexpected download repository");
if (!/^[a-f0-9]{40}$/.test(downloads.revision)) throw new Error("Unpinned download revision");
for (const group of downloads.groups) {
  for (const file of group.files) {
    const source = `${group.source}/${file}.gz`;
    if (source.split("/").some(segment => !segment || segment === "." || segment === "..") || /[\\\x00-\x1f]/.test(source)) throw new Error("Unsafe download source");
    downloadUrls.set(`${group.destination}/${file}`, `https://raw.githubusercontent.com/rewire-bio/rewire-benchmark-data/${downloads.revision}/${source.split("/").map(encodeURIComponent).join("/")}`);
  }
}

const worker = {
  async fetch(request, env) {
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
    if (isDownload(url.pathname)) {
      const target = downloadUrls.get(url.pathname);
      if (!target || !["GET", "HEAD"].includes(request.method)) return new Response("Not found", { status: 404 });
      // Do not forward credentials, cookies or bodies to GitHub. GET and HEAD
      // redirects retain Range and If-Range for byte-exact upstream downloads.
      return new Response(null, { status: 307, headers: {
        Location: target + url.search, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      } });
    }
    if (!isProxied(url.pathname)) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
      // Missing chunks must stay missing in this version. Never fall back to
      // another service whose HTML and content-addressed chunks may differ.
      if (url.pathname.startsWith("/_next/static/")) return new Response("Not found", { status: 404 });
      const missing = await env.ASSETS.fetch(new Request(new URL("/404", request.url), request));
      return new Response(missing.body, { status: 404, headers: missing.headers });
    }
    const upstream = backendUrl(url);
    const forwarded = new Request(upstream, request);
    forwarded.headers.delete("host");
    const response = await fetch(forwarded, {
      redirect: "manual", cf: { cacheTtl: 0, cacheEverything: false },
    });
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("CDN-Cache-Control");
    headers.delete("Cloudflare-CDN-Cache-Control");
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
