/** The public catalogue contract shared by Firestore and static-release adapters. */
export interface CatalogueRecord {
  id: string;
  kind:
    | "model"
    | "benchmark"
    | "dataset"
    | "baseline"
    | "evaluation"
    | "result"
    | "source"
    | "claim";
  name: string;
  description: string;
  status: string;
  facets: Record<string, string[]>;
  source_ids: string[];
  links: { relation: string; target_id: string }[];
  attributes: Record<string, unknown>;
}
export interface CatalogueSnapshot {
  schema_version: string;
  release_id: string;
  released_at: string;
  coverage: Record<string, unknown>;
  records: CatalogueRecord[];
}
export interface ListInput {
  kind?: CatalogueRecord["kind"];
  q?: string;
  area?: string;
  status?: string;
  origin?: string;
  cursor?: string;
  limit?: number;
}
export interface ResultsInput {
  id: string;
  metric?: string;
  origin?: string;
  configuration_id?: string;
  cursor?: string;
  limit?: number;
}
export interface ResultRow {
  result: CatalogueRecord;
  evaluation: CatalogueRecord | null;
  models: CatalogueRecord[];
  benchmarks: CatalogueRecord[];
  datasets: CatalogueRecord[];
  sources: CatalogueRecord[];
  origin: string;
  review_status: string;
}
const privateKeys = new Set([
  "email",
  "contact_email",
  "session_token",
  "access_token",
  "token",
  "token_hash",
  "private_correspondence",
]);
export function assertPublicCatalogue(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (privateKeys.has(key.toLowerCase()))
      throw new Error("Private data cannot enter a public catalogue release.");
    assertPublicCatalogue(child);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical));
  if (value && typeof value === "object")
    return JSON.stringify(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return JSON.stringify(value);
}
function known(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string")
    return (
      !!v.trim() &&
      ![
        "unknown",
        "not_reported",
        "not reported",
        "unreported",
        "unextracted",
        "unavailable",
      ].includes(v.trim().toLowerCase())
    );
  if (Array.isArray(v)) return v.length > 0 && v.every(known);
  if (typeof v === "object")
    return Object.keys(v).length > 0 && Object.values(v).every(known);
  return true;
}
export function createCatalogueQuery(snapshot: CatalogueSnapshot) {
  assertPublicCatalogue(snapshot);
  const records = snapshot.records
    .filter((r) => r.status !== "excluded")
    .sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(records.map((r) => [r.id, r]));
  if (byId.size !== records.length) throw new Error("Duplicate catalogue IDs");
  const reverse = new Map<
    string,
    { relation: string; record: CatalogueRecord }[]
  >();
  for (const record of records)
    for (const link of record.links) {
      const list = reverse.get(link.target_id) || [];
      list.push({ relation: link.relation, record });
      reverse.set(link.target_id, list);
    }
  const linked = (record: CatalogueRecord | null, relation: string) =>
    (record?.links || [])
      .filter((l) => l.relation === relation)
      .flatMap((l) => {
        const r = byId.get(l.target_id);
        return r ? [r] : [];
      });
  const profileSources = (value: unknown): string[] => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) =>
      ["source_ids", "summary_source_ids"].includes(key) && Array.isArray(child)
        ? child.filter((id): id is string => typeof id === "string")
        : profileSources(child),
    );
  };
  const sources = (...items: (CatalogueRecord | null)[]) =>
    [
      ...new Set(
        items.flatMap((r) => [
          ...(r?.source_ids || []),
          ...profileSources(r?.attributes.profile),
        ]),
      ),
    ].flatMap((id) => {
      const r = byId.get(id);
      return r?.kind === "source" ? [r] : [];
    });
  const rows: ResultRow[] = records
    .filter((r) => r.kind === "result")
    .map((result) => {
      const evaluation = linked(result, "evaluation")[0] || null;
      return {
        result,
        evaluation,
        models: linked(evaluation, "model"),
        benchmarks: linked(evaluation, "benchmark"),
        datasets: linked(evaluation, "dataset"),
        sources: sources(result, evaluation),
        origin: String(evaluation?.attributes.origin || "unreported"),
        review_status: result.status,
      };
    });
  const associationClaims = new Set(
    records
      .filter(
        (r) =>
          r.kind === "claim" &&
          ["source_checked", "reproduced"].includes(r.status) &&
          r.source_ids.length > 0 &&
          !!r.attributes.source_locator,
      )
      .flatMap((r) =>
        r.links
          .filter((l) => l.relation === "subject")
          .map((l) => `${l.target_id}|${String(r.attributes.field)}`),
      ),
  );
  function verifiedAssociation(
    record: CatalogueRecord,
    link: { relation: string; target_id: string },
  ): boolean {
    const target = byId.get(link.target_id);
    if (
      !target ||
      !associationClaims.has(
        `${record.id}|links:${link.relation}:${link.target_id}`,
      )
    )
      return false;
    if (["family", "variant_of", "alias_of"].includes(link.relation))
      return record.kind === "model" && target.kind === "model";
    if (["part_of", "evaluates_task"].includes(link.relation))
      return (
        ["benchmark", "evaluation"].includes(record.kind) &&
        target.kind === "benchmark"
      );
    return false;
  }
  const visibleRecords = records.filter(
    (r) =>
      !r.links.some(
        (l) => l.relation === "alias_of" && verifiedAssociation(r, l),
      ),
  );
  // Roll up only sourced identity/membership edges. A pipeline using a model is not that model.
  function ancestors(id: string, seen = new Set<string>()): Set<string> {
    if (seen.has(id)) return seen;
    seen.add(id);
    const record = byId.get(id);
    for (const link of record?.links || [])
      if (verifiedAssociation(record!, link)) ancestors(link.target_id, seen);
    return seen;
  }
  const rowIndex = new Map<string, ResultRow[]>();
  for (const row of rows) {
    const direct = [
      row.result.id,
      row.evaluation?.id,
      ...row.models.map((r) => r.id),
      ...row.benchmarks.map((r) => r.id),
      ...row.datasets.map((r) => r.id),
      ...linked(row.evaluation, "baseline").map((r) => r.id),
    ].filter((id): id is string => !!id);
    for (const id of new Set(direct.flatMap((id) => [...ancestors(id)]))) {
      const list = rowIndex.get(id) || [];
      list.push(row);
      rowIndex.set(id, list);
    }
  }
  const release_id = snapshot.release_id;
  function page<T>(
    items: T[],
    input: { cursor?: string; limit?: number },
    key: string,
    getId: (item: T) => string,
  ) {
    const limit = input.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("Page limit must be between 1 and 100");
    let start = 0;
    if (input.cursor) {
      let cursor: { release: string; key: string; after: string };
      try {
        cursor = JSON.parse(decodeURIComponent(input.cursor));
      } catch {
        throw new Error("Invalid catalogue cursor");
      }
      if (cursor.release !== release_id || cursor.key !== key)
        throw new Error("Cursor does not match release or filters");
      const index = items.findIndex((item) => getId(item) === cursor.after);
      if (index < 0) throw new Error("Cursor record is unavailable");
      start = index + 1;
    }
    const selected = items.slice(start, start + limit);
    return {
      release_id,
      items: selected,
      total: items.length,
      next_cursor:
        start + limit < items.length
          ? encodeURIComponent(
              JSON.stringify({
                release: release_id,
                key,
                after: getId(selected[selected.length - 1]),
              }),
            )
          : null,
    };
  }
  return {
    release: () => ({
      release_id,
      schema_version: snapshot.schema_version,
      released_at: snapshot.released_at,
      coverage: snapshot.coverage,
      record_count: records.length,
      facets: {
        areas: [
          ...new Set(records.flatMap((r) => r.facets.areas || [])),
        ].sort(),
        statuses: [...new Set(records.map((r) => r.status))].sort(),
        counts: Object.fromEntries(
          [...new Set(records.map((r) => r.kind))].map((kind) => [
            kind,
            visibleRecords.filter((r) => r.kind === kind).length,
          ]),
        ),
      },
    }),
    list(input: ListInput = {}) {
      const { cursor, limit, ...filters } = input;
      const q = input.q?.trim().toLowerCase();
      const originMatches = (origin: unknown) =>
        input.origin === "literature"
          ? [
              "author_reported",
              "independent_paper",
              "paper_compilation",
            ].includes(String(origin))
          : input.origin === "rewire"
            ? origin === "rewire_run"
            : origin === input.origin;
      const selected = visibleRecords.filter(
        (r) =>
          (!input.kind || r.kind === input.kind) &&
          (!input.status || r.status === input.status) &&
          (!input.area ||
            Object.values(r.facets).some((values) =>
              values.includes(input.area!),
            )) &&
          (!q ||
            [r.id, r.name, r.description, ...Object.values(r.facets).flat()]
              .join(" ")
              .toLowerCase()
              .includes(q)) &&
          (!input.origin ||
            !["result", "evaluation"].includes(r.kind) ||
            originMatches(r.attributes.origin) ||
            (rowIndex.get(r.id) || []).some((row) =>
              originMatches(row.origin),
            )),
      );
      return page(selected, input, canonical(filters), (r) => r.id);
    },
    get({ id }: { id: string }) {
      const record = byId.get(id);
      if (!record) return null;
      return {
        release_id,
        record,
        direct: record.links.flatMap((l) => {
          const target = byId.get(l.target_id);
          return target ? [{ relation: l.relation, record: target }] : [];
        }),
        reverse: reverse.get(id) || [],
        sources: sources(record, ...linked(record, "evaluation")),
      };
    },
    results(input: ResultsInput) {
      const { cursor, limit, ...filters } = input;
      const available = rowIndex.get(input.id) || [];
      const selected = available.filter(
        (row) =>
          (!input.metric || row.result.attributes.metric === input.metric) &&
          (!input.origin || row.origin === input.origin) &&
          (!input.configuration_id ||
            row.evaluation?.id === input.configuration_id),
      );
      return {
        ...page(selected, input, canonical(filters), (r) => r.result.id),
        evaluation_count: new Set(
          selected.flatMap((row) =>
            row.evaluation ? [row.evaluation.id] : [],
          ),
        ).size,
        facets: {
          metrics: [
            ...new Set(
              available.map((row) => String(row.result.attributes.metric)),
            ),
          ].sort(),
          origins: [...new Set(available.map((row) => row.origin))].sort(),
          configurations: [
            ...new Map(
              available.flatMap((row) =>
                row.evaluation
                  ? [
                      [
                        row.evaluation.id,
                        { id: row.evaluation.id, name: row.evaluation.name },
                      ] as const,
                    ]
                  : [],
              ),
            ).values(),
          ],
        },
      };
    },
    compare({ ids }: { ids: string[] }) {
      const reasons = new Set<string>();
      if (ids.length < 2) reasons.add("Choose at least two results.");
      if (ids.length > 20) throw new Error("Compare at most 20 results");
      if (new Set(ids).size !== ids.length)
        reasons.add(
          "The same result cannot supply independent evidence twice.",
        );
      const selected = ids.map((id) =>
        rows.find((row) => row.result.id === id),
      );
      if (selected.some((r) => !r))
        reasons.add("A selected result is unavailable.");
      const valid = selected.filter((r): r is ResultRow => !!r);
      for (const row of valid) {
        if (
          row.sources.some(
            (source) =>
              Array.isArray(source.attributes.evidence_concerns) &&
              source.attributes.evidence_concerns.length,
          )
        )
          reasons.add(
            "A source has unresolved evidence concerns; this result cannot support a comparison.",
          );
        if (!["source_checked", "reproduced"].includes(row.result.status))
          reasons.add(
            "Only current, source-checked or reproduced results can be compared.",
          );
        if (!row.evaluation) reasons.add("An evaluation record is missing.");
        if (
          ["superseded", "disputed", "excluded"].includes(
            row.evaluation?.status || "",
          )
        )
          reasons.add("An evaluation is disputed, superseded or excluded.");
        if (
          row.origin === "paper_compilation" ||
          row.evaluation?.links.some(
            (l) => l.relation === "original_evaluation",
          )
        )
          reasons.add(
            "A quoted result is not independent evidence; consult its original evaluation.",
          );
      }
      if (valid.some((r) => !r.datasets.length))
        reasons.add("Dataset identity is not fully linked.");
      else if (
        new Set(valid.map((r) => canonical(r.datasets.map((d) => d.id).sort())))
          .size > 1
      )
        reasons.add("Evaluations use different datasets.");
      function check(field: string, values: unknown[]) {
        if (values.some((v) => !known(v)))
          reasons.add(`${field.replace(/_/g, " ")} is not fully reported.`);
        else if (new Set(values.map(canonical)).size > 1)
          reasons.add(
            `${field.replace(/_/g, " ")} differs between evaluations.`,
          );
      }
      for (const field of ["metric", "unit", "metric_direction"])
        check(
          field,
          valid.map((r) => r.result.attributes[field]),
        );
      for (const field of [
        "protocol_id",
        "dataset_version",
        "split",
        "population",
        "inputs",
        "adaptation",
        "metric_implementation",
        "aggregation",
        "budget",
      ])
        check(
          field,
          valid.map(
            (r) =>
              (
                r.evaluation?.attributes.comparison as
                  Record<string, unknown> | undefined
              )?.[field],
          ),
        );
      return {
        release_id,
        compatible: reasons.size === 0,
        reasons: [...reasons],
      };
    },
  };
}
export type CatalogueQuery = ReturnType<typeof createCatalogueQuery>;
