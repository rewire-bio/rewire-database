import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";

export const DEFAULT_THRESHOLDS = { lines: 90, statements: 90, functions: 90, branches: 90 };

export function mergeUiCoverage(
  files,
  { thresholds = DEFAULT_THRESHOLDS, reportDir = "coverage/ui", quiet = false } = {},
) {
  if (!files.length) throw new Error("No coverage files provided to merge");
  const map = libCoverage.createCoverageMap({});
  for (const file of files) {
    map.merge(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  fs.mkdirSync(reportDir, { recursive: true });
  const context = libReport.createContext({ dir: reportDir, coverageMap: map });
  if (!quiet) reports.create("text").execute(context);
  reports.create("json-summary").execute(context);
  reports.create("json").execute(context);
  const summary = map.getCoverageSummary().toJSON();
  const failures = [];
  for (const metric of ["lines", "statements", "functions", "branches"]) {
    const actual = summary[metric]?.pct ?? 0;
    const required = thresholds[metric] ?? 0;
    if (actual < required) {
      failures.push(`UI ${metric} coverage ${actual}% is below the ${required}% threshold`);
    }
  }
  return { summary, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : fs.readdirSync("coverage")
        .map((entry) => path.join("coverage", entry, "coverage-final.json"))
        .filter((file) => fs.existsSync(file))
        .sort();
  const { failures } = mergeUiCoverage(files);
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
}
