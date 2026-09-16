import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

/** Preserve already published exports byte for byte, even from a clean checkout. */
export function restoreReleaseBundles(
  input = "data/omics/releases",
  output = "public/omics/releases",
) {
  for (const name of fs
    .readdirSync(input)
    .filter((name) => name.endsWith(".bundle.json.gz"))) {
    const id = name.replace(/\.bundle\.json\.gz$/, "");
    if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(id))
      throw new Error("Invalid archived release ID");
    const files = JSON.parse(
      gunzipSync(fs.readFileSync(path.join(input, name))).toString(),
    ) as Record<string, string>;
    const receipt = fs.readFileSync(path.join(input, `${id}.json`), "utf8");
    const manifest = JSON.parse(receipt);
    if (files["manifest.json"] !== receipt || manifest.release_id !== id)
      throw new Error("Archived manifest mismatch");
    const expected = ["catalogue.json", "records.csv", "records.jsonl"].sort();
    if (
      JSON.stringify(Object.keys(manifest.files).sort()) !==
        JSON.stringify(expected) ||
      JSON.stringify(Object.keys(files).sort()) !==
        JSON.stringify([...expected, "manifest.json"].sort())
    )
      throw new Error("Unexpected archived files");
    for (const file of expected) {
      if (
        typeof files[file] !== "string" ||
        createHash("sha256").update(files[file]).digest("hex") !==
          manifest.files[file]
      )
        throw new Error(`Archive checksum mismatch: ${id}/${file}`);
    }
    for (const [file, bytes] of Object.entries(files)) {
      const target = path.join(output, id, file);
      if (fs.existsSync(target) && fs.readFileSync(target, "utf8") !== bytes)
        throw new Error(`Immutable release conflict: ${target}`);
    }
    fs.mkdirSync(path.join(output, id), { recursive: true });
    for (const [file, bytes] of Object.entries(files))
      fs.writeFileSync(path.join(output, id, file), bytes);
  }
}
