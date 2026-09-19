import path from "node:path";
import { importAuditFiles } from "./audit-import.js";
import { readFile } from "node:fs/promises";
import { firebase } from "./firebase.js";
import { importRelease } from "./catalogue.js";
import { activateRelease } from "./catalogue-service.js";
const [snapshot, manifest] = process.argv.slice(2);
if (!snapshot || (snapshot !== "--current" && !manifest))
  throw new Error(
    "Usage: npm run import-release -- catalogue.json manifest.json OR --activate release-id OR --current",
  );
const result =
  snapshot === "--current"
    ? {
        release_id:
          (await firebase().db.doc("cataloguePublication/active").get()).data()
            ?.release_id || null,
      }
    : snapshot === "--activate"
      ? await activateRelease(firebase().db, manifest)
      : await importRelease(
          firebase().db,
          await readFile(snapshot),
          JSON.parse(await readFile(manifest, "utf8")),
        );
if (snapshot !== "--current" && snapshot !== "--activate") {
  const metadata = JSON.parse(await readFile(manifest, "utf8"));
  const files: Record<string, Buffer> = {};
  const base = path.dirname(snapshot);
  for (const name of Object.keys(metadata.files).filter((n) =>
    /^audit-[a-z0-9-]+\.json$/.test(n),
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
}
console.log(JSON.stringify(result, null, 2));
await firebase().db.terminate();
