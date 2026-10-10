/**
 * Display names for metric concept keys (the `metric` attribute of results, from the metric
 * scheme in rewire-benchmark-data data/vocab/metric.ttl).
 *
 * - metricLabel("f1-score") is "F1"; metricLabel("sensitivity-at-97-9-percent-specificity") is
 *   "Sensitivity at 97.9% specificity". Pass the concept's prefLabel when the data provides one.
 * - acronymCase("recall (na12878 wgs)") is "recall (NA12878 WGS)": fixes the case of known
 *   acronyms in free text (qualifiers, labels) and changes nothing else.
 * - unitSuffix("minute") is " min", for appending to a printed number.
 */

/** Short names for keys whose generated name would read badly. */
const NAMES: Record<string, string> = {
  "f1-score": "F1", "f-beta-score": "F-beta", "macro-f1": "Macro F1", "micro-f1": "Micro F1", "median-f1": "Median F1",
  recall: "Recall", precision: "Precision",
  "pearson-correlation": "Pearson", "spearman-correlation": "Spearman", "pearson-delta": "Pearson delta",
  "pearson-r-squared": "Pearson R²", "coefficient-of-determination": "R²",
  "matthews-correlation-coefficient": "MCC", "cohens-d": "Cohen's d", "youden-index": "Youden index",
  "root-mean-squared-error": "RMSE", "mean-squared-error": "MSE", "mean-absolute-error": "MAE",
  "true-positive-count": "True positives", "false-positive-count": "False positives",
  "true-negative-count": "True negatives", "false-negative-count": "False negatives",
  "log2-likelihood-ratio": "log₂ likelihood ratio", "z-score": "Z-score", "r-precision": "R-precision",
  "cppc-topk-overlap-auc": "CPPC top-k overlap AUC", "foldbench-success-rate": "FoldBench success rate",
  "capri-acceptable-target-count": "CAPRI acceptable targets", "capri-medium-target-count": "CAPRI medium targets",
  "capri-high-target-count": "CAPRI high-quality targets",
  lddt: "lDDT", "lddt-lp": "lDDT-LP", "lddt-pli": "lDDT-PLI", dockq: "DockQ",
};

/** Lower-case words shown in capitals. Whole words only. */
const ACRONYMS = new Set([
  "f1", "auc", "auroc", "auprc", "auspc", "roc", "ndcg", "mcc", "capri", "cppc", "rmse", "rmsd", "mae", "mse", "fdr",
  "ppv", "npv", "vus", "acmg", "amp", "l1", "l2", "tm", "gdt", "mces", "ari", "nmi", "hvg", "hvgs", "mrl", "lod",
  "snv", "snvs", "cnv", "cnvs", "sv", "svs", "wgs", "wes", "dna", "rna", "cfdna", "ctdna", "ci", "sd", "gpu", "cpu",
]);
const caseWord = (word: string) =>
  ACRONYMS.has(word) || /^(pvs|ps|pm|pp|ba|bs|bp)\d$/.test(word) || /^(na|hg)\d{3,}$/.test(word) ? word.toUpperCase() : word;

/** Fix the case of known acronyms and ACMG/AMP codes (bp4, pp3) in free text. */
export const acronymCase = (text: string) => text.replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => (word === word.toLowerCase() ? caseWord(word) : word));

/** A readable name for a metric concept key, preferring the vocabulary's prefLabel when given. */
export function metricLabel(key: string, prefLabel?: string | null): string {
  if (prefLabel) return prefLabel;
  if (NAMES[key]) return NAMES[key];
  // "97-9-percent" is 97.9%, "70-percent" is 70%, "top-10" is "top-10".
  const text = key
    .replace(/(\d+)-(\d+)-percent\b/g, "$1.$2%")
    .replace(/(\d+)-percent\b/g, "$1%")
    .replace(/\btop-(\d+)\b(?!%)/g, "top‑$1")
    .replace(/-/g, " ")
    .replace(/‑/g, "-");
  const cased = acronymCase(text);
  return cased.charAt(0).toUpperCase() + cased.slice(1);
}

const UNITS: Record<string, string> = {
  percent: "%", minute: " min", hour: " h", second: " s", gigabyte: " GB", "us-dollar": " USD",
  "kilocalorie-per-mole": " kcal/mol", electronvolt: " eV", nanometre: " nm", angstrom: " Å", "sample-per-second": " samples/s",
};
/** What to append to a number in this unit, or "" for counts, fractions and unitless values. */
export const unitSuffix = (unit: string | null | undefined) => (unit ? UNITS[unit] ?? "" : "");
