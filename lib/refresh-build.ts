import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { adoptRefresh, parseRefresh, type RefreshData } from "./refresh";

/** Missing legacy metadata is unknown; malformed or mismatched metadata fails. */
export function readRefresh(root = process.cwd(), expectedReleaseId?: string): RefreshData | null {
  const file = path.join(root, "public/omics/refresh.json");
  let bytes: string;
  try { bytes = fs.readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const data = parseRefresh(JSON.parse(bytes));
  const manifestBytes = fs.readFileSync(path.join(root, "public/omics/manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (typeof manifest.release_id !== "string" ||
      (expectedReleaseId && manifest.release_id !== expectedReleaseId))
    throw new Error("Refresh metadata is being read against a different catalogue release");
  if (typeof manifest.released_at !== "string" || !Number.isFinite(Date.parse(manifest.released_at)))
    throw new Error("Adopted release manifest has an invalid release time");
  const archives: Record<string, string> = {};
  for (const release of new Set(data.updates.map((update) => update.release_id))) {
    if (release === manifest.release_id) continue;
    let bytes: Buffer;
    try { bytes = fs.readFileSync(path.join(root, "data/omics/releases", `${release}.json`)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const archive = JSON.parse(bytes.toString("utf8"));
    if (archive.release_id !== release)
      throw new Error("Refresh archive receipt has a different release identity");
    if (typeof archive.released_at !== "string" || !Number.isFinite(Date.parse(archive.released_at)))
      throw new Error("Refresh archive receipt has an invalid release time");
    if (Date.parse(archive.released_at) > Date.parse(manifest.released_at)) continue;
    archives[release] = createHash("sha256").update(bytes).digest("hex");
  }
  return adoptRefresh(data, manifest.release_id, createHash("sha256").update(manifestBytes).digest("hex"), archives);
}
