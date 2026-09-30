import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { CatalogueSnapshot } from "../../services/omics/src/catalogue-query";

/** Authenticate a pinned snapshot without expanding its other historical files. */
export function readPinnedResearchSnapshot(root: string, releaseId: string): Buffer {
  if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(releaseId))
    throw new Error("Invalid research source release pin");
  const archiveRoot = path.join(root, "data/omics/releases");
  const receipt = fs.readFileSync(path.join(archiveRoot, `${releaseId}.json`));
  const manifest = JSON.parse(receipt.toString("utf8"));
  const digest = manifest.files?.["catalogue.json"];
  if (manifest.release_id !== releaseId || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))
    throw new Error("Research source release receipt mismatch");
  const restored = path.join(root, "public/omics/releases", releaseId, "catalogue.json");
  const compressed = path.join(archiveRoot, releaseId, "catalogue.json.gz");
  let bytes: Buffer;
  if (fs.existsSync(restored)) {
    if (!fs.lstatSync(restored).isFile()) throw new Error("Research source snapshot must be a regular file");
    bytes = fs.readFileSync(restored);
  } else if (fs.existsSync(compressed)) bytes = gunzipSync(fs.readFileSync(compressed));
  else {
    const bundle = JSON.parse(gunzipSync(fs.readFileSync(path.join(archiveRoot, `${releaseId}.bundle.json.gz`))).toString("utf8"));
    if (bundle["manifest.json"] !== receipt.toString("utf8") || typeof bundle["catalogue.json"] !== "string")
      throw new Error("Research source bundle receipt mismatch");
    bytes = Buffer.from(bundle["catalogue.json"]);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error("Research source catalogue checksum mismatch");
  if (JSON.parse(bytes.toString("utf8")).release_id !== releaseId)
    throw new Error("Research source release pin mismatch");
  return bytes;
}

export function loadPinnedResearchSnapshot(root: string, releaseId: string): CatalogueSnapshot {
  return JSON.parse(readPinnedResearchSnapshot(root, releaseId).toString("utf8"));
}

/** Keep the release generator itself byte-identical: its source hash is part of
 * the scientific release ID. Missing pins exist only during this synchronous
 * loader call; existing files and directories are never replaced or removed.
 */
export function withResearchPins<T>(load: () => T, root = "."): T {
  root = path.resolve(root);
  const input = path.join(root, "data/research/manifests.json");
  if (!fs.existsSync(input)) return load();
  const manifests = JSON.parse(fs.readFileSync(input, "utf8"));
  if (!Array.isArray(manifests)) throw new Error("Invalid research manifest inputs");
  const pins = [...new Set(manifests.map(item => item.catalogue_release_id))];
  const createdFiles: { file: string; ino: number; dev: number }[] = [];
  const createdDirectories: string[] = [];
  try {
    for (const id of pins) {
      const bytes = readPinnedResearchSnapshot(root, id);
      let directory = root;
      for (const name of ["public", "omics", "releases", id]) {
        directory = path.join(directory, name);
        try { fs.mkdirSync(directory); createdDirectories.push(directory); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          if (!fs.lstatSync(directory).isDirectory()) throw new Error("Research pin directory must be a real directory");
        }
      }
      const file = path.join(directory, "catalogue.json");
      if (fs.existsSync(file)) continue;
      // Open exclusively and retain ownership even if writing the bytes fails.
      const fd = fs.openSync(file, "wx");
      const { ino, dev } = fs.fstatSync(fd);
      createdFiles.push({ file, ino, dev });
      try { fs.writeFileSync(fd, bytes); }
      finally { fs.closeSync(fd); }
    }
    return load();
  } finally {
    for (const { file, ino, dev } of createdFiles.reverse()) {
      try {
        const current = fs.lstatSync(file);
        if (current.ino === ino && current.dev === dev) fs.unlinkSync(file);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    for (const directory of createdDirectories.reverse()) {
      try { fs.rmdirSync(directory); }
      catch (error) {
        if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
      }
    }
  }
}
