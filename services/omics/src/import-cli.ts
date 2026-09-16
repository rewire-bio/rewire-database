import { readFile } from "node:fs/promises";
import { firebase } from "./firebase.js";
import { importRelease } from "./catalogue.js";
const [snapshot, manifest] = process.argv.slice(2);
if (!snapshot || !manifest)
  throw new Error(
    "Usage: npm run import-release -- catalogue.json manifest.json",
  );
const result = await importRelease(
  firebase().db,
  await readFile(snapshot),
  JSON.parse(await readFile(manifest, "utf8")),
);
console.log(JSON.stringify(result, null, 2));
await firebase().db.terminate();
