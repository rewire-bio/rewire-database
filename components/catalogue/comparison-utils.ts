import type { ResultRow } from "@/services/omics/src/catalogue-query";

export function numericScore(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Only explicit, structured uncertainty definitions can produce marks. */
export function scoreInterval(
  row: ResultRow,
): { low: number; high: number; label: string } | null {
  const value = numericScore(row.result.attributes.numeric_value);
  const raw = row.result.attributes.uncertainty;
  if (value === null || !raw || typeof raw !== "object" || Array.isArray(raw))
    return null;
  const uncertainty = raw as Record<string, unknown>;
  const type = String(uncertainty.type || uncertainty.kind || "");
  if (["standard_error", "standard_deviation"].includes(type)) {
    const amount = numericScore(uncertainty.value ?? uncertainty.printed_value);
    if (amount === null || amount < 0) return null;
    return {
      low: value - amount,
      high: value + amount,
      label: type.replace(/_/g, " "),
    };
  }
  if (["confidence_interval", "credible_interval"].includes(type)) {
    const low = numericScore(uncertainty.lower ?? uncertainty.low);
    const high = numericScore(uncertainty.upper ?? uncertainty.high);
    const level = uncertainty.level ?? uncertainty.confidence_level;
    if (
      low === null ||
      high === null ||
      low > value ||
      high < value ||
      level == null
    )
      return null;
    return { low, high, label: `${String(level)} ${type.replace(/_/g, " ")}` };
  }
  return null;
}

/** Always use the complete panel so hiding/searching rows never changes the axis. */
export function comparisonRange(
  rows: ResultRow[],
  metric: string,
  unit: string,
  zoom: boolean,
): [number, number] {
  const values = rows.flatMap((row) => {
    const value = numericScore(row.result.attributes.numeric_value);
    if (value === null) return [];
    const interval = scoreInterval(row);
    return interval ? [value, interval.low, interval.high] : [value];
  });
  if (!values.length) return [0, 1];
  const low = Math.min(...values),
    high = Math.max(...values);
  if (!zoom) {
    const normalUnit = unit.trim().toLowerCase();
    const normalMetric = metric.trim().toLowerCase().replace(/[ -]+/g, "_");
    const fractionMetrics = new Set([
      "auc",
      "auroc",
      "roc_auc",
      "auprc",
      "accuracy",
      "f1",
      "f1_score",
      "precision",
      "recall",
      "ap",
      "average_precision",
      "ndcg",
    ]);
    const bareMetric = normalMetric
      .replace(/^(?:macro|micro|weighted)_/, "")
      .replace(/^(ndcg)@\d+$/, "$1");
    if (
      normalUnit === "correlation" ||
      /correlation|pearson|spearman|kendall|matthews|(?:^|_)mcc(?:_|$)/i.test(
        normalMetric,
      )
    )
      return [Math.min(-1, low), Math.max(1, high)];
    if (
      normalUnit === "fraction" ||
      (["unitless", "dimensionless"].includes(normalUnit) &&
        fractionMetrics.has(bareMetric) &&
        rows.every((row) => {
          const value = numericScore(row.result.attributes.numeric_value);
          return value === null || (value >= 0 && value <= 1);
        }))
    )
      return [Math.min(0, low), Math.max(1, high)];
    if (["percent", "%", "percentage", "score_0_100"].includes(normalUnit))
      return [Math.min(0, low), Math.max(100, high)];
  }
  const padding =
    high === low ? Math.max(Math.abs(low) * 0.05, 0.01) : (high - low) * 0.06;
  return [low - padding, high + padding];
}
