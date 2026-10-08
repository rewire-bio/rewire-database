import path from "node:path";
import { importAuditFiles } from "./audit-import.js";
import { importUseCaseFiles } from "./use-case-import.js";
import { readFile } from "node:fs/promises";
import { firebase } from "./firebase.js";
import { importRelease } from "./catalogue.js";
import { activateRelease } from "./catalogue-service.js";
import { importRecordPages } from "./record-page-store.js";
const [snapshot, manifest, pagesManifest] = process.argv.slice(2);
if (!snapshot || (snapshot !== "--current" && !manifest) || (snapshot === "--pages" && !pagesManifest))
  throw new Error(
    "Usage: npm run import-release -- catalogue.json manifest.json OR --activate release-id OR --current OR --pages catalogue.json manifest.json",
  );
async function pages(catalogue: string, manifestFile: string) {
  const metadata = JSON.parse(await readFile(manifestFile, "utf8"));
  return importRecordPages(firebase().db, metadata.release_id, await readFile(catalogue));
}
const result =
  snapshot === "--current"
    ? {
        release_id:
          (await firebase().db.doc("cataloguePublication/active").get()).data()
            ?.release_id || null,
      }
    : snapshot === "--activate"
      ? await activateRelease(firebase().db, manifest)
      : snapshot === "--pages"
        // Attach record pages to an imported release; the bytes must match it.
        ? await pages(manifest, pagesManifest)
        : await importRelease(
            firebase().db,
            await readFile(snapshot),
            JSON.parse(await readFile(manifest, "utf8")),
          );
if (!["--current", "--activate", "--pages"].includes(snapshot)) {
  const metadata = JSON.parse(await readFile(manifest, "utf8"));
  const files: Record<string, Buffer> = {};
  const base = path.dirname(snapshot);
  for (const name of Object.keys(metadata.files).filter(
    (n) => /^audit-[a-z0-9-]+\.json$/.test(n) || n === "use-cases.json",
  )) {
    try {
      files[name] = await readFile(path.join(base, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!/^[a-z0-9-]+$/.test(metadata.release_id))
        throw Error("Invalid release identity");
      files[name] = await readFile(
        path.join(base, "releases", metadata.release_id, name),
      );
    }
  }
  await importAuditFiles(firebase().db, result.release_id, metadata, files);
  await importUseCaseFiles(firebase().db, result.release_id, metadata, files);
  // Pages embed use-case backlinks, so they are built from the stored artifact.
  console.log(JSON.stringify(await pages(snapshot, manifest), null, 2));
}
console.log(JSON.stringify(result, null, 2));
await firebase().db.terminate();
