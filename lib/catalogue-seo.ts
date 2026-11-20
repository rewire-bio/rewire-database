import { DERIVED_LABEL, resultDerivation } from "./derivation";
import { catalogueText } from "./catalogue-text";
import { formatScore } from "./score-display";
import { singularKindLabels } from "./omics-browse";
import { recordHref, type OmicsRecord } from "./omics";

const indexes = new WeakMap<
  readonly OmicsRecord[],
  ReadonlyMap<string, OmicsRecord>
>();
const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? catalogueText(String(value)).replace(/\s+/g, " ").trim()
    : "";
const sentence = (value: string) =>
  value && /[.!?]$/.test(value) ? value : value ? `${value}.` : "";
const join = (values: string[]) =>
  [...new Set(values.filter(Boolean))].join("; ");
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Supporting assertions and use-case record stubs remain readable and crawlable but are not search landing pages. */
export function recordIsIndexable(record: Pick<OmicsRecord, "kind">): boolean {
  return record.kind !== "claim" && record.kind !== "use_case";
}

/** Presentation only: use recorded fields and explicit links, never inferred model aliases.
 * No character cap: removing scope or a reproduction caveat to fit a nominal snippet
 * length would be misleading. Search engines may choose a different visible snippet.
 */
export function recordSearchMetadata(
  record: OmicsRecord,
  records: readonly OmicsRecord[],
) {
  let byId = indexes.get(records);
  if (!byId) {
    byId = new Map(records.map((item) => [item.id, item]));
    indexes.set(records, byId);
  }
  const linked = (item: OmicsRecord, relations: string[]) =>
    item.links
      .filter((link) => relations.includes(link.relation))
      .flatMap((link) => {
        const target = byId.get(link.target_id);
        return target ? [target] : [];
      });
  const name = text(record.name);
  const kind = singularKindLabels[record.kind].toLowerCase();
  const version = text(record.attributes.version);
  const checkpoint = text(record.attributes.checkpoint);
  const identity = join([
    name,
    version && !name.includes(version) ? version : "",
    checkpoint && !name.includes(checkpoint) ? checkpoint : "",
  ]);
  const profile = text(object(record.attributes.profile).summary);
  const summary = profile || text(record.description);
  const sources = record.source_ids.flatMap((id) => {
    const source = byId.get(id);
    return source?.kind === "source" ? [source] : [];
  });
  const sourceContext = sources.length
    ? `Source: ${join(sources.slice(0, 2).map((source) => text(source.name)))}`
    : "";
  const context = (item: OmicsRecord) =>
    join(
      linked(item, [
        "model",
        "method",
        "configuration",
        "pipeline",
        "service",
        "baseline",
        "benchmark",
        "protocol",
        "task",
        "dataset",
        "dataset_subset",
      ]).map(
        (target) => `${singularKindLabels[target.kind]}: ${text(target.name)}`,
      ),
    );
  const review =
    record.status === "source_checked"
      ? "Source checked; not independently reproduced."
      : record.status === "reproduced"
        ? "Record status: reproduced."
        : `Record status: ${text(record.status).replaceAll("_", " ")}; independent reproduction is not established by this record.`;
  let title = `${identity} | ${kind}`;
  let description: string;
  if (record.kind === "result") {
    const evaluation = linked(record, ["evaluation"])[0];
    const metric = text(record.attributes.metric);
    // Same display rounding as result tables; scientific values remain untouched.
    const rawValue =
      text(record.attributes.printed_value) ||
      text(record.attributes.numeric_value);
    const value = rawValue ? formatScore(rawValue) : "";
    const unit = text(record.attributes.unit);
    const cleanUnit =
      (/%/.test(value) && /^(%|percent|percentage)$/i.test(unit)) ||
      /^(unitless|dimensionless)$/i.test(unit)
        ? ""
        : unit;
    const valueWithUnit = [value, cleanUnit].filter(Boolean).join(" ");
    const measurement = metric
      ? `${metric}${valueWithUnit ? `: ${valueWithUnit}` : ""}`
      : valueWithUnit;
    // Existing names already identify the source task and usually its metric. Add
    // only the displayed value, and never repeat a value already written there.
    if (
      value &&
      !name.includes(`${metric}: ${value}`) &&
      !name.includes(`${metric} = ${value}`)
    )
      title = `${name}: ${valueWithUnit} | result`;
    const comparison = object(evaluation?.attributes.comparison);
    description = [
      sentence(measurement || name),
      resultDerivation(record.attributes) ? sentence(DERIVED_LABEL) : "",
      sentence(
        evaluation
          ? context(evaluation) || `Evaluation: ${text(evaluation.name)}`
          : "",
      ),
      sentence(
        join([
          comparison.split ? `Split: ${text(comparison.split)}` : "",
          record.attributes.aggregation
            ? `Aggregation: ${text(record.attributes.aggregation)}`
            : "",
        ]),
      ),
      review,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (record.kind === "evaluation") {
    const comparison = object(record.attributes.comparison);
    description = [
      sentence(`${identity}: ${context(record) || "recorded evaluation"}`),
      sentence(
        join([
          record.attributes.protocol
            ? `Protocol: ${text(record.attributes.protocol)}`
            : "",
          comparison.split ? `Split: ${text(comparison.split)}` : "",
          comparison.inputs ? `Inputs: ${text(comparison.inputs)}` : "",
          comparison.adaptation
            ? `Adaptation: ${text(comparison.adaptation)}`
            : "",
        ]),
      ),
      review,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (record.kind === "source") {
    description = [
      sentence(
        `${identity}${text(record.attributes.year) ? ` (${text(record.attributes.year)})` : ""}: source record`,
      ),
      sentence(
        record.attributes.doi ? `DOI: ${text(record.attributes.doi)}` : "",
      ),
      sentence(
        summary ||
          "Linked evidence and source metadata in the biological benchmark database",
      ),
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    description = [
      sentence(
        summary && summary.toLowerCase().startsWith(identity.toLowerCase())
          ? summary
          : `${identity}: ${summary || `${kind} record in the biological benchmark database`}`,
      ),
      sentence(context(record)),
      sentence(
        ["configuration", "dataset", "dataset_subset", "baseline"].includes(
          record.kind,
        )
          ? sourceContext
          : "",
      ),
    ]
      .filter(Boolean)
      .join(" ");
  }
  return {
    title,
    description,
    alternates: {
      canonical: `https://benchmarks.rewirebio.io${recordHref(record)}`,
    },
    robots: { index: recordIsIndexable(record), follow: true as const },
  };
}

// ============================================================================
// Schema.org JSON-LD Type Definitions & Generators (Milestone 4 - Feature 10)
// ============================================================================

export interface SchemaOrganization {
  "@type": "Organization";
  name: string;
  url?: string;
}

export interface SchemaOffer {
  "@type": "Offer";
  price: string | number;
  priceCurrency: string;
}

export interface SchemaSoftwareApplicationItem {
  "@type": "SoftwareApplication";
  name: string;
  url: string;
  applicationCategory: string;
  operatingSystem: string;
  memoryRequirements?: string;
  author?: SchemaOrganization;
  license?: string;
  offers?: SchemaOffer;
  description?: string;
}

export interface SchemaListItem {
  "@type": "ListItem";
  position: number;
  name: string;
  url: string;
  item: SchemaSoftwareApplicationItem;
}

export interface SchemaItemList {
  "@context": "https://schema.org";
  "@type": "ItemList";
  name: string;
  description: string;
  numberOfItems: number;
  itemListElement: SchemaListItem[];
  url?: string;
}

export interface SchemaSoftwareApplicationRoot extends SchemaSoftwareApplicationItem {
  "@context": "https://schema.org";
}

export interface SchemaDatasetRoot {
  "@context": "https://schema.org";
  "@type": "Dataset";
  name: string;
  description: string;
  url?: string;
  variableMeasured?: string | string[];
  creator?: SchemaOrganization;
  citation?: string[];
  license?: string;
}

export interface LeaderboardItemRowInput {
  model_id: string;
  model_name: string;
  /** The model's page on this site. */
  model_href?: string;
  primary_metric_name?: string;
  display_value?: string;
  rank?: number | null;
  source_record_id?: string;
  telemetry?: {
    min_vram_gb?: number | null;
    open_weights?: boolean | null;
    license?: string | null;
    license_scope?: string | null;
  } | null;
}

export interface LeaderboardItemListOptions {
  name: string;
  description: string;
  rows: readonly LeaderboardItemRowInput[];
  url?: string;
  baseUrl?: string;
}

export interface ModelSoftwareApplicationOptions {
  id: string;
  name: string;
  description?: string;
  applicationCategory?: string;
  operatingSystem?: string;
  creator?: string;
  telemetry?: {
    min_vram_gb?: number | null;
    open_weights?: boolean | null;
    license?: string | null;
    license_scope?: string | null;
  } | null;
  url?: string;
  baseUrl?: string;
}

export interface BenchmarkDatasetOptions {
  name: string;
  description: string;
  variableMeasured?: string | string[];
  creator?: string | { name: string; url?: string };
  citation?: string | string[];
  url?: string;
  license?: string;
  baseUrl?: string;
}

const DEFAULT_ORIGIN = "https://benchmarks.rewirebio.io";

/**
 * Generates a Schema.org ItemList JSON-LD representation for model leaderboards.
 */
export function generateLeaderboardItemListJsonLd({
  name,
  description,
  rows,
  url,
  baseUrl = DEFAULT_ORIGIN,
}: LeaderboardItemListOptions): SchemaItemList {
  const itemListElement: SchemaListItem[] = rows.map((row, index) => {
    const canonicalUrl = `${baseUrl}${row.model_href ?? `/database/configuration/${encodeURIComponent(row.model_id)}/`}`;

    const appItem: SchemaSoftwareApplicationItem = {
      "@type": "SoftwareApplication",
      name: row.model_name,
      url: canonicalUrl,
      applicationCategory: "Bioinformatics Foundation Model",
      operatingSystem: "Linux, macOS, Windows",
    };

    if (row.telemetry?.min_vram_gb !== null && row.telemetry?.min_vram_gb !== undefined) {
      appItem.memoryRequirements = `${row.telemetry.min_vram_gb} GB VRAM`;
    }

    if (row.telemetry?.license && row.telemetry.license_scope !== "code") {
      appItem.license = row.telemetry.license;
    }

    if (row.telemetry?.open_weights === true) {
      appItem.offers = {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      };
    }

    if (row.primary_metric_name && row.display_value) {
      appItem.description = `${row.primary_metric_name}: ${row.display_value}${row.source_record_id ? ` (result ${baseUrl}/database/result/${encodeURIComponent(row.source_record_id)}/)` : ""}`;
    }

    return {
      "@type": "ListItem",
      position: row.rank ?? index + 1,
      name: row.model_name,
      url: canonicalUrl,
      item: appItem,
    };
  });

  const schema: SchemaItemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: rows.length,
    itemListElement,
  };

  if (url) {
    schema.url = url;
  }

  return schema;
}

/**
 * Generates a Schema.org SoftwareApplication JSON-LD representation for model profile pages.
 */
export function generateModelSoftwareApplicationJsonLd({
  id,
  name,
  description,
  applicationCategory = "Bioinformatics Foundation Model",
  operatingSystem = "Linux, macOS, Windows",
  creator,
  telemetry,
  url,
  baseUrl = DEFAULT_ORIGIN,
}: ModelSoftwareApplicationOptions): SchemaSoftwareApplicationRoot {
  const canonicalUrl = url || `${baseUrl}/database/model/${id}/`;

  const schema: SchemaSoftwareApplicationRoot = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    url: canonicalUrl,
    applicationCategory,
    operatingSystem,
    description: description || `${name} biological foundation model.`,
  };

  if (telemetry?.min_vram_gb !== null && telemetry?.min_vram_gb !== undefined) {
    schema.memoryRequirements = `${telemetry.min_vram_gb} GB VRAM`;
  }

  if (creator) {
    schema.author = {
      "@type": "Organization",
      name: creator,
    };
  }

  if (telemetry?.license && telemetry.license_scope !== "code") {
    schema.license = telemetry.license;
  }

  if (telemetry?.open_weights) {
    schema.offers = {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    };
  }

  return schema;
}

/**
 * Generates a Schema.org Dataset JSON-LD representation for benchmark and dataset pages.
 */
export function generateBenchmarkDatasetJsonLd({
  name,
  description,
  variableMeasured,
  creator,
  citation,
  url,
  license,
}: BenchmarkDatasetOptions): SchemaDatasetRoot {
  const citations = citation
    ? Array.isArray(citation)
      ? citation
      : [citation]
    : undefined;

  const orgCreator: SchemaOrganization | undefined = creator
    ? typeof creator === "string"
      ? { "@type": "Organization", name: creator }
      : { "@type": "Organization", ...creator }
    : undefined;

  const schema: SchemaDatasetRoot = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name,
    description,
  };

  if (url) schema.url = url;
  if (variableMeasured) schema.variableMeasured = variableMeasured;
  if (orgCreator) schema.creator = orgCreator;
  if (citations && citations.length > 0) schema.citation = citations;
  if (license) schema.license = license;

  return schema;
}

/**
 * Mapping of primary biological category slugs to underlying database records.
 */
export const CATEGORY_SLUG_MAP: Record<string, string> = {
  "structure-prediction": "structural-hypotheses-experiments",
  "variant-effect": "protein-variant-effect-prediction",
  "protein-design": "de-novo-binder-design",
  "transcriptomics": "genetic-perturbation-response",
  "genomic-grammar": "plant-promoter-reporters",
};

/**
 * Resolves a URL slug to its target use-case record ID/slug.
 */
export function resolveUseCaseTargetSlug(slug: string): string {
  return CATEGORY_SLUG_MAP[slug] ?? slug;
}

