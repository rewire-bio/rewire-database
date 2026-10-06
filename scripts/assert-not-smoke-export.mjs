import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MARKER = "out/omics/smoke-manifest.json";

/** `npm run build:smoke` writes this marker; a full `npm run build` or
 * `npm run build:web` never does. Every publication path (the "deploy" npm
 * script, scripts/deploy-catalogue.mjs, scripts/deploy-cloudflare.mjs) calls
 * this before touching anything, so a PR smoke export can never be published
 * as the real website, however it got into `out/`. */
export function assertNotSmokeExport(root = process.cwd()) {
  const marker = path.join(root, MARKER);
  if (fs.existsSync(marker)) {
    const manifest = JSON.parse(fs.readFileSync(marker, "utf8"));
    throw new Error(
      `Refusing to publish: ${MARKER} marks this export as a PR smoke build ` +
        `(${manifest.total_routes} sampled routes, not the full catalogue). ` +
        `Run "npm run build" or "npm run build:web" to produce a publishable export.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assertNotSmokeExport();
}
