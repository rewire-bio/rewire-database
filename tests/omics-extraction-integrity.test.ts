import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPinnedPdfText } from "../scripts/omics/extract/pdf";
import { buildBatch, type BatchSpec } from "../scripts/omics/extract/batch";
import { proteinBenchBlocks } from "../scripts/omics/extract/proteinbench";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const spawn = vi.mocked(spawnSync);
const conversion = (text: string, stderr = "", status = 0) => ({
  pid: 1,
  output: [null, Buffer.from(text), Buffer.from(stderr)],
  stdout: Buffer.from(text),
  stderr: Buffer.from(stderr),
  status,
  signal: null,
});

describe("pinned PDF transformations", () => {
  let directory: string;
  let pdf: string;
  const bytes = Buffer.from("test PDF input bytes");
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "omics-pdf-test-"));
    pdf = path.join(directory, "source.pdf");
    fs.writeFileSync(pdf, bytes);
    spawn.mockReset();
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("rejects the wrong artifact before invoking the converter", () => {
    expect(() => readPinnedPdfText(pdf, "0".repeat(64))).toThrow("Artifact hash");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("converts the verified bytes and receipts the exact output and converter", () => {
    spawn.mockReturnValueOnce(conversion("Model  0.85\n", "Recovered xref\n"));
    spawn.mockReturnValueOnce(conversion("", "pdftotext version 26.08.0\nCopyright\n"));
    const result = readPinnedPdfText(pdf, hash(bytes));
    expect(spawn).toHaveBeenNthCalledWith(1, "pdftotext",
      ["-layout", "-enc", "UTF-8", "-", "-"], expect.objectContaining({ input: bytes }));
    expect(result).toEqual({
      text: "Model  0.85\n",
      transformation: {
        tool: "pdftotext",
        tool_version: "pdftotext version 26.08.0",
        arguments: ["-layout", "-enc", "UTF-8", "-", "-"],
        input_sha256: hash(bytes),
        output_sha256: hash("Model  0.85\n"),
        diagnostics: ["Recovered xref"],
      },
    });
  });

  it("rejects changed legacy text even when the supplied PDF has the right hash", () => {
    const text = path.join(directory, "source.txt");
    fs.writeFileSync(text, "Model  0.95\n");
    spawn.mockReturnValueOnce(conversion("Model  0.85\n"));
    expect(() => readPinnedPdfText(text, hash(bytes), pdf)).toThrow("Supplied text does not match");
  });

  it("accepts the legacy two-path invocation when its text is identical", () => {
    const text = path.join(directory, "source.txt");
    fs.writeFileSync(text, "Model  0.85\n");
    spawn.mockReturnValueOnce(conversion("Model  0.85\n"));
    spawn.mockReturnValueOnce(conversion("", "pdftotext version 26.08.0\n"));
    expect(readPinnedPdfText(text, hash(bytes), pdf).text).toBe("Model  0.85\n");
  });

  it("does not accept partial output from a failed converter", () => {
    spawn.mockReturnValueOnce(conversion("Model  0.85\n", "Damaged PDF", 1));
    expect(() => readPinnedPdfText(pdf, hash(bytes))).toThrow("pdftotext failed: Damaged PDF");
  });
});

describe("ProteinBench table completeness", () => {
  const table = () => ({
    caption: "Table 2",
    rows: [
      ["", ...Array.from({ length: 12 }, (_, i) => `Metric ${i} ↑`)],
      ...Array.from({ length: 4 }, (_, i) => [`Method ${i}`, ...Array(12).fill("0.5")]),
    ],
  });
  it("rejects a silently truncated table", () => {
    const input = table();
    input.rows.pop();
    expect(() => proteinBenchBlocks(input, "Table 2")).toThrow("unexpected row or column count");
  });
  it("rejects a short row instead of treating an absent cell as missing data", () => {
    const input = table();
    input.rows[1].pop();
    expect(() => proteinBenchBlocks(input, "Table 2")).toThrow("expected 13 cells, got 12");
  });
  it("rejects a dropped metric header", () => {
    const input = table();
    input.rows[0][4] = "";
    expect(() => proteinBenchBlocks(input, "Table 2")).toThrow("unexpected row or column count");
  });
});

describe("source-defined uncertainty", () => {
  const fixture = (): BatchSpec => ({
    key: "example", benchmarkId: "benchmark", benchmarkName: "Example", area: "proteins-complexes",
    source: { id: "source", name: "Paper", url: "https://example.org", artifactUrl: "https://example.org/paper.pdf", sha256: "a".repeat(64), version: "v1", venue: "Example", retrievedAt: "2026-09-19" },
    reviewer: "test", date: "2026-09-19", method: "transcription", caveats: ["Not reproduced"],
    tasks: [{ label: "A", title: "Task A", metric: "Accuracy", metricKey: "accuracy", unit: "fraction", direction: "higher", dataset: "Dataset", protocol: "Test split", locator: "Table 1" }],
    methods: [{ name: "Method", kind: "method", description: "Method", locator: "Table 1" }],
    cells: [{ method: "Method", task: "A", printed: "0.9 ± 0.01", value: "0.9", sd: "0.01", locator: "Table 1 row 1" }],
  });
  it("does not infer a standard deviation merely from a printed spread", () => {
    const result = buildBatch(fixture()).find((record) => record.kind === "result")!;
    expect(result.attributes.uncertainty).toEqual({ type: "reported_plus_minus_type_unresolved", value: "0.01" });
  });
  it.each(["standard_deviation", "standard_error"] as const)("preserves an explicitly sourced %s", (uncertaintyType) => {
    const result = buildBatch({ ...fixture(), uncertaintyType }).find((record) => record.kind === "result")!;
    expect(result.attributes.uncertainty).toEqual({ type: uncertaintyType, value: "0.01" });
  });
});
