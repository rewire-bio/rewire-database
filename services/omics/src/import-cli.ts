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
console.log(JSON.stringify(result, null, 2));
await firebase().db.terminate();
