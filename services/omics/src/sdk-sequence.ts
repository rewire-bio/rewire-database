import { sequenceContract } from "./sdk-sequence-reference.js";

export type SequenceBundle = {
  protocol_id: string;
  protocol_version: string;
  dataset_id: string;
  scope: string;
  completion: string;
  data_verification?: string;
  evaluation_claim?: string;
  evaluation_method?: string;
  execution_status: string;
  metrics: Record<string, unknown>;
  coverage: { denominator: number; scored: number; unscored: number };
  provenance: Record<string, string>;
};
type Bounds = {
  minimum: number | null;
  maximum: number | null;
  integer: boolean;
};
type Contract = {
  protocol_version: string;
  upstream_revision: string;
  required_hashes: string[];
  performance_metrics: string[];
  metrics: Record<string, Bounds>;
  methods_by_execution: Record<string, string[]>;
  datasets: Record<
    string,
    { verified_provenance: Record<string, string>; denominator: number | null }
  >;
};
const protocols: Record<string, Contract> = sequenceContract.protocols;
export const isSequenceProtocol = (id: string) => Object.hasOwn(protocols, id);

/** Source identity checks validate declarations, never upgrade a contribution to reproduced. */
export function sequenceSubmissionIssues(value: SequenceBundle): string[] {
  const errors: string[] = [];
  const reject = (message: string) => errors.push(message);
  const protocol = protocols[value.protocol_id];
  if (!protocol) return ["Unsupported sequence protocol"];
  if (value.evaluation_claim !== "local_evaluation_not_paper_reproduction")
    reject("Sequence evaluations must disclaim paper reproduction");
  if (
    value.protocol_version !== protocol.protocol_version ||
    value.provenance.upstream_revision !== protocol.upstream_revision
  )
    reject("Sequence protocol version or evaluator revision mismatch");
  if (
    !protocol.required_hashes.every((key) =>
      /^[a-f0-9]{64}$/.test(value.provenance[key] ?? ""),
    )
  )
    reject("Sequence evaluation requires source and split hashes");
  if (
    !protocol.methods_by_execution[value.execution_status]?.includes(
      value.evaluation_method ?? "",
    )
  )
    reject("Evaluation method does not match execution status");
  const dataset = Object.hasOwn(protocol.datasets, value.dataset_id)
    ? protocol.datasets[value.dataset_id]
    : undefined;
  if (!dataset) reject("Unknown sequence dataset identity");
  const keys = Object.keys(value.metrics);
  if (
    keys.length !== Object.keys(protocol.metrics).length ||
    keys.some((key) => !Object.hasOwn(protocol.metrics, key))
  )
    reject("Include exactly the prescribed sequence metrics");
  for (const [key, bounds] of Object.entries(protocol.metrics)) {
    const metric = value.metrics[key];
    if (metric === null && !bounds.integer) continue;
    if (
      typeof metric !== "number" ||
      !Number.isFinite(metric) ||
      (bounds.integer && !Number.isSafeInteger(metric))
    ) {
      reject(`Invalid scalar metric ${key}`);
      continue;
    }
    if (
      (bounds.minimum !== null && metric < bounds.minimum) ||
      (bounds.maximum !== null && metric > bounds.maximum)
    )
      reject(`Metric ${key} is outside its valid range`);
  }
  if (
    !protocol.performance_metrics.some(
      (key) => typeof value.metrics[key] === "number",
    )
  )
    reject("Counts alone are not a benchmark metric");
  if (
    Object.hasOwn(protocol.metrics, "n") &&
    value.metrics.n !== value.coverage.scored
  )
    reject("Metric n must reconcile with scored coverage");
  const pinned =
    dataset &&
    Object.keys(dataset.verified_provenance).length > 0 &&
    Object.entries(dataset.verified_provenance).every(
      ([key, digest]) => value.provenance[key] === digest,
    );
  if (value.data_verification === "pinned_source_bytes") {
    if (!pinned || value.coverage.denominator !== dataset?.denominator)
      reject(
        "Source verification requires pinned bytes and the canonical denominator",
      );
  } else if (
    value.data_verification !==
    "local_bytes_hashed_not_independently_source_verified"
  )
    reject("Sequence evaluations must declare source verification");
  if (
    value.scope === "full" &&
    (value.data_verification !== "pinned_source_bytes" ||
      !pinned ||
      dataset?.denominator !== value.coverage.denominator)
  )
    reject("Full scope requires pinned source and canonical denominator");
  if (value.protocol_id === "dart-eval-task1-zero-shot-v1") {
    const pairs = value.metrics.n_pairs;
    const denominator = value.metrics.pairs_denominator;
    const signed = value.metrics.signed_rank_sum;
    if (value.metrics.acc === null)
      reject("A scored DART pair set requires accuracy");
    if (
      typeof pairs !== "number" ||
      typeof denominator !== "number" ||
      2 * denominator !== value.coverage.denominator ||
      pairs > Math.floor(value.coverage.scored / 2) ||
      pairs < Math.max(0, value.coverage.scored - denominator)
    )
      reject("DART pair coverage does not reconcile");
    if (
      typeof signed === "number" &&
      typeof pairs === "number" &&
      signed > (pairs * (pairs + 1)) / 2
    )
      reject("DART signed-rank sum exceeds available pairs");
  }
  return errors;
}
