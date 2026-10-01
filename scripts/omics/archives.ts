import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { validateUseCaseArtifact } from "../../services/omics/src/use-cases";
import { parseUseCaseSourceDeclaration, writeUseCaseSourceCopies } from "./use-cases";

function expectedFiles(manifest: any): string[] {
  const names = [
    "catalogue.json",
    "records.csv",
    "records.jsonl",
    ...(manifest.coverage?.evidence_table_version === "1.0"
      ? ["evidence.csv", "evidence.jsonl"]
      : []),
    ...(manifest.coverage?.use_cases !== undefined ? ["use-cases.json"] : []),
  ];
  if (manifest.coverage?.use_case_sources !== undefined) {
    if (manifest.coverage?.use_cases === undefined)
      throw Error("Archived use-case sources require declared use cases");
    names.push(...parseUseCaseSourceDeclaration(manifest.coverage.use_case_sources)
      .map((source) => source.file));
  }
  if (manifest.coverage?.research_schema_version === "1.0") {
    names.push("research-manifests.json", "research-readiness.json", "research-investigations.json");
  }
  if (manifest.coverage?.audit_history) {
    names.push(
      "audit-index.json",
      "audit-runs.json",
      "audit-resolutions.json",
      "audit-checks.jsonl",
      "audit-checks.csv",
    );
    const chunks = Object.keys(manifest.files)
      .filter((n) => /^audit-checks-[0-9]{6}\.json$/.test(n))
      .sort();
    if (manifest.coverage.audit_history.checks > 0 && !chunks.length)
      throw Error("Unexpected archived files: missing audit chunks");
    if (
      chunks.some(
        (n, i) => n !== `audit-checks-${String(i).padStart(6, "0")}.json`,
      )
    )
      throw Error("Unexpected archived files: non-contiguous audit chunks");
    names.push(...chunks);
  }
  return names.sort();
}

function restoreSourceCopies(
  manifest: any,
  read: (file: string) => string,
  output: string,
) {
  if (manifest.coverage?.use_case_sources === undefined) return;
  const declaration = parseUseCaseSourceDeclaration(manifest.coverage.use_case_sources);
  const files = Object.fromEntries(declaration.map((source) => {
    const bytes = read(source.file);
    if (createHash("sha256").update(bytes).digest("hex") !== source.sha256 ||
        manifest.files[source.file] !== source.sha256)
      throw Error("Archived use-case source checksum mismatch");
    return [source.file, bytes];
  }));
  writeUseCaseSourceCopies(files, path.join(path.dirname(output), "sources"));
}

function validateUseCases(
  manifest: any,
  read: (file: string) => string,
) {
  if (manifest.coverage?.use_cases === undefined) return;
  const snapshot = JSON.parse(read("catalogue.json"));
  if (snapshot.release_id !== manifest.release_id ||
      JSON.stringify(snapshot.coverage?.use_cases) !==
      JSON.stringify(manifest.coverage.use_cases))
    throw Error("Archived use-case release binding mismatch");
  validateUseCaseArtifact(
    snapshot, JSON.parse(read("use-cases.json")), manifest.coverage.use_cases,
  );
}

/** Preserve already published exports byte for byte, even from a clean checkout. */
export function restoreReleaseBundles(
  input = "data/omics/releases",
  output = "public/omics/releases",
) {
  // Historical releases often repeat the same immutable audit exports. Keep
  // their paths and bytes, but store verified identical content only once on
  // the output filesystem. Never rewrite or relink an existing destination.
  const verifiedFiles = new Map<string, string>();
  const writeVerified = (target: string, bytes: Buffer) => {
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (fs.existsSync(target)) {
      if (!fs.lstatSync(target).isFile() || !fs.readFileSync(target).equals(bytes))
        throw new Error(`Immutable release conflict: ${target}`);
    } else {
      const source = verifiedFiles.get(digest);
      if (source) {
        // Recheck the source itself before sharing its inode. A matching input
        // receipt must never cause a changed output file to be propagated.
        if (!fs.lstatSync(source).isFile() || !fs.readFileSync(source).equals(bytes))
          throw new Error(`Immutable release conflict: ${source}`);
        fs.linkSync(source, target);
      } else fs.writeFileSync(target, bytes, { flag: "wx" });
    }
    if (!verifiedFiles.has(digest)) verifiedFiles.set(digest, target);
  };
  // Large releases use one compressed file per artifact. A single JSON bundle
  // can exceed Node's string limit even when every individual artifact fits.
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !/^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(entry.name)
    )
      continue;
    const receipt = fs.readFileSync(path.join(input, `${entry.name}.json`));
    const manifest = JSON.parse(receipt.toString());
    if (manifest.release_id !== entry.name)
      throw new Error("Archived release ID mismatch");
    const expected = expectedFiles(manifest);
    if (
      JSON.stringify(Object.keys(manifest.files).sort()) !==
        JSON.stringify([...expected].sort()) ||
      JSON.stringify(fs.readdirSync(path.join(input, entry.name)).sort()) !==
        JSON.stringify(expected.map((n) => `${n}.gz`).sort())
    )
      throw new Error("Unexpected archived files");
    const readChecked = (name: string) => {
      const bytes = gunzipSync(fs.readFileSync(path.join(input, entry.name, `${name}.gz`)));
      if (createHash("sha256").update(bytes).digest("hex") !== manifest.files[name])
        throw new Error(`Archive checksum mismatch: ${entry.name}/${name}`);
      return bytes.toString("utf8");
    };
    validateUseCases(manifest, readChecked);
    const dir = path.join(output, entry.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of [...expected, "manifest.json"]) {
      const bytes =
        name === "manifest.json"
          ? receipt
          : gunzipSync(
              fs.readFileSync(path.join(input, entry.name, `${name}.gz`)),
            );
      if (
        name !== "manifest.json" &&
        createHash("sha256").update(bytes).digest("hex") !==
          manifest.files[name]
      )
        throw new Error(`Archive checksum mismatch: ${entry.name}/${name}`);
      const target = path.join(dir, name);
      writeVerified(target, bytes);
    }
    restoreSourceCopies(manifest, readChecked, output);
  }
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
    const expected = expectedFiles(manifest);
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
    validateUseCases(manifest, (name) => files[name]);
    for (const [file, bytes] of Object.entries(files)) {
      const target = path.join(output, id, file);
      if (fs.existsSync(target) && fs.readFileSync(target, "utf8") !== bytes)
        throw new Error(`Immutable release conflict: ${target}`);
    }
    fs.mkdirSync(path.join(output, id), { recursive: true });
    for (const [file, bytes] of Object.entries(files)) {
      const target = path.join(output, id, file);
      writeVerified(target, Buffer.from(bytes, "utf8"));
    }
    restoreSourceCopies(manifest, (name) => files[name], output);
  }
}
