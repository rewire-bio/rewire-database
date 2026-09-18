/**
 * Extract the Open Problems label projection results into catalogue records.
 *
 * Source: the pinned openproblems.bio results page for label projection
 * v1.0.0. The page renders its table in the browser, but the run records are
 * embedded in the served HTML as JSON, so the numbers come from the same bytes
 * the hash pins rather than from a rendered screenshot.
 *
 * Each run carries its own metric names and values and the page carries a
 * "maximize" flag per metric, so direction is read from the source rather than
 * assumed.
 *
 * A method is recorded with its preprocessing parameter set, because the same
 * method appears several times under different preprocessing and those are
 * different runs. true_labels and random_labels are the suite's positive and
 * negative controls, which bound the scale rather than compete on it.
 *
 * This is one task of the Open Problems suite, the one this artifact covers.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import { decode } from "./tables";
import {
  slug,
  writeBatch,
  type BatchSpec,
  type CellSpec,
  type MethodSpec,
  type TaskSpec,
} from "./batch";

const SHA256 =
  "e223ab712ff55997a3abe659f280d4ea2952700e767b87e02c434701da9833c1";
const DATE = "2026-09-18";

type Info = { name: string; label: string; summary?: string; maximize?: boolean };
type Run = {
  dataset_name: string;
  method_name: string;
  paramset_name: string | null;
  succeeded: boolean;
  metric_names: string[];
  metric_values: number[];
};

/**
 * Undo the way the page's framework serialises its data.
 *
 * Every value arrives as a pair: 0 marks a plain value and 1 marks an array of
 * further pairs. Reading it without unwrapping yields arrays of type tags.
 */
function unwrap(node: unknown): unknown {
  if (Array.isArray(node) && node.length === 2 && (node[0] === 0 || node[0] === 1))
    return node[0] === 0
      ? unwrap(node[1])
      : (node[1] as unknown[]).map(unwrap);
  if (node && typeof node === "object")
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([k, v]) => [
        k,
        unwrap(v),
      ]),
    );
  return node;
}

function run(file: string) {
  const html = fs.readFileSync(file, "utf8");
  const sha = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (sha !== SHA256)
    throw new Error(`Artifact hash ${sha} does not match the pinned ${SHA256}`);

  const embedded = [...html.matchAll(/props="([^"]{500,})"/g)]
    .map((match) => decode(match[1]))
    .filter((value) => value.includes('"results"'))
    .sort((a, b) => b.length - a.length)[0];
  if (!embedded) throw new Error("No embedded results found in the page");
  const data = unwrap(JSON.parse(embedded)) as {
    results: Run[];
    methodInfo: Info[];
    metricInfo: Info[];
    datasetInfo: Info[];
  };
  const runs = data.results.filter((entry) => entry.succeeded);
  if (runs.length < 100) throw new Error(`Only ${runs.length} successful runs`);

  const byName = (list: Info[]) => new Map(list.map((item) => [item.name, item]));
  const metrics = byName(data.metricInfo);
  const datasets = byName(data.datasetInfo);
  const methodInfo = byName(data.methodInfo);

  const tasks = new Map<string, TaskSpec>();
  const methods = new Map<string, MethodSpec>();
  const cells: CellSpec[] = [];

  for (const entry of runs) {
    const dataset = datasets.get(entry.dataset_name);
    const info = methodInfo.get(entry.method_name);
    if (!dataset || !info)
      throw new Error(`Unknown dataset or method in ${entry.dataset_name}`);
    const control = /^(true_labels|random_labels)$/.test(entry.method_name);
    const name = entry.paramset_name
      ? `${info.label} (${entry.paramset_name})`
      : info.label;
    if (!methods.has(name))
      methods.set(name, {
        name,
        kind: control ? "method" : "configuration",
        description: control
          ? "Control run included by Open Problems to bound the scale: perfect labels or random labels, not a competing method."
          : `${info.summary ?? "Method run by the Open Problems suite."}`.slice(0, 600),
        locator: `results, method(${entry.method_name}), paramset(${entry.paramset_name ?? "none"})`,
      });
    entry.metric_names.forEach((metricName, i) => {
      const metric = metrics.get(metricName);
      if (!metric) throw new Error(`Unknown metric ${metricName}`);
      const label = `${slug(entry.dataset_name)}-${slug(metricName)}`.toUpperCase();
      tasks.set(label, {
        label,
        title: `Label projection on ${dataset.label}, ${metric.label}`,
        metric: metric.label,
        metricKey: slug(metricName),
        unit: "fraction",
        direction: metric.maximize ? "higher" : "lower",
        dataset: dataset.label,
        protocol: `${dataset.summary ?? ""}`.slice(0, 400),
        locator: `results, dataset(${entry.dataset_name}), metric(${metricName})`,
      });
      const value = entry.metric_values[i];
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      cells.push({
        method: name,
        task: label,
        printed: String(value),
        value: String(value),
        sd: null,
        locator: `results, dataset(${entry.dataset_name}), method(${entry.method_name}), paramset(${entry.paramset_name ?? "none"}), metric(${metricName})`,
      });
    });
  }

  const spec: BatchSpec = {
    key: "open-problems",
    benchmarkId: "discovery-benchmark-open-problems",
    benchmarkName: "Open Problems label projection",
    area: "cells-tissues",
    source: {
      id: "expansion-p3-open-problems",
      emit: false,
      name: "Open Problems label projection benchmark, v1.0.0 results page",
      url: "https://www.openproblems.bio/benchmarks/label_projection/v1.0.0/",
      artifactUrl:
        "https://www.openproblems.bio/benchmarks/label_projection/v1.0.0/",
      sha256: SHA256,
      version: "v1.0.0",
      venue: "Open Problems project site",
      retrievedAt: DATE,
    },
    reviewer: "Codex research agent; no human review claimed",
    date: DATE,
    method:
      "Deterministic parse of the run records embedded in the pinned page, with the direction of each metric taken from the page's own maximize flag",
    caveats: [
      "Results published by the Open Problems project, source checked but not independently reproduced.",
      "This covers the label projection task at v1.0.0 only, not the whole Open Problems suite.",
      "true_labels and random_labels are controls that bound the scale, not competing methods.",
      "Preprocessing is part of the run, so the same method appears once per parameter set.",
    ],
    tasks: [...tasks.values()],
    methods: [...methods.values()],
    cells,
  };
  writeBatch(spec);
}

if (process.argv[1]?.endsWith("open-problems.ts")) run(process.argv[2]);
