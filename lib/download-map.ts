import fs from "node:fs";
import { dataPath, dataPin } from "./data-pin";
import { downloadLocations, downloadUrls } from "../scripts/download-locations.mjs";

let urls: Map<string, string> | undefined;

/** Exact GitHub export for a site download path, from the pinned producer manifest. */
export function downloadTarget(pathname: string): string | undefined {
  if (!urls) {
    // The container's verified copy, or the producer checkout during development.
    const file = [dataPath("website/manifest.json"), dataPath("workbench/benchmark-data/website/manifest.json")].find((name) => fs.existsSync(name));
    if (!file) throw new Error("Pinned producer manifest unavailable");
    urls = downloadUrls(downloadLocations(dataPin(), fs.readFileSync(file)));
  }
  return urls.get(pathname);
}

/** 307 to the listed gzip export, or 404: no other file is ever a download. */
export function downloadRedirect(pathname: string, request: Request): Response {
  const target = downloadTarget(pathname);
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!target) return new Response("Not found", { status: 404, headers });
  return new Response(null, { status: 307, headers: { ...headers, Location: target + new URL(request.url).search } });
}
