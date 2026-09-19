import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";

const digest = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

export type PdfTransformation = {
  tool: "pdftotext";
  tool_version: string;
  arguments: string[];
  input_sha256: string;
  output_sha256: string;
  diagnostics?: string[];
};

/** Read scores only from text generated from the exact verified PDF bytes.
 * A legacy <text> <pdf> invocation remains supported, but stale or edited text
 * is rejected instead of being attributed to a PDF it was not extracted from.
 */
export function readPinnedPdfText(
  input: string,
  expectedSha256: string,
  legacyPdf?: string,
): { text: string; transformation: PdfTransformation } {
  const pdf = fs.readFileSync(legacyPdf ?? input);
  const sha = digest(pdf);
  if (sha !== expectedSha256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${expectedSha256}`);
  const args = ["-layout", "-enc", "UTF-8", "-", "-"];
  // stdin binds the transformation to the bytes above even if the input file
  // changes between verification and conversion.
  const converted = spawnSync("pdftotext", args, {
    input: pdf,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
  });
  if (converted.error) throw converted.error;
  if (converted.status !== 0)
    throw new Error(`pdftotext failed: ${converted.stderr.toString("utf8").trim()}`);
  const output = converted.stdout;
  const diagnostics = converted.stderr.toString("utf8").trim().split(/\r?\n/).filter(Boolean);
  if (legacyPdf && !fs.readFileSync(input).equals(output))
    throw new Error(
      "Supplied text does not match pdftotext -layout output from the pinned PDF. " +
        "Pass the PDF alone to regenerate its text with the installed converter.",
    );
  // pdftotext writes its version to stderr, including on successful exit.
  const version = spawnSync("pdftotext", ["-v"], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  if (version.error) throw version.error;
  const toolVersion = Buffer.concat([version.stdout, version.stderr])
    .toString("utf8")
    .split(/\r?\n/)
    .find((line) => /^pdftotext version\s+\S/.test(line));
  if (version.status !== 0 || !toolVersion)
    throw new Error("Could not identify the pdftotext version used for extraction");
  return {
    text: output.toString("utf8"),
    transformation: {
      tool: "pdftotext",
      tool_version: toolVersion,
      arguments: args,
      input_sha256: sha,
      output_sha256: digest(output),
      ...(diagnostics.length ? { diagnostics } : {}),
    },
  };
}
