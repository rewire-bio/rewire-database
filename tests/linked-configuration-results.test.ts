import { describe, expect, it } from "vitest";
import { linkedResultRecords, unattributedLinkedRecords } from "@/lib/entity-detail";
import { summaryText } from "@/lib/omics-browse";

const record = (id: string, kind = "configuration") => ({
  id,
  kind,
  name: id,
  description: "",
  status: "source_checked",
  facets: {},
  source_ids: [],
  links: [],
  attributes: {},
});

// A family with direct results, a configuration whose link is reviewed (its results are
// already in the family's own table), one whose link is not, and a pipeline that uses it.
const detail = {
  record: record("family", "model"),
  direct: [],
  reverse: [
    { relation: "configuration_of", record: record("verified") },
    { relation: "configuration_of", record: record("unverified") },
    { relation: "configuration_of", record: record("empty") },
    { relation: "uses_model", record: record("pipeline", "pipeline") },
  ],
} as never;
const totals: Record<string, [number, number]> = { verified: [4, 2], unverified: [18, 18], pipeline: [3, 1], empty: [0, 0] };
const query = {
  results: ({ id }: { id: string }) => ({ total: totals[id]?.[0] ?? 0, evaluation_count: totals[id]?.[1] ?? 0 }),
  verifiedAssociation: (subject: string, relation: string, target: string) =>
    subject === "verified" && relation === "configuration_of" && target === "family",
} as never;

describe("results held on linked configurations", () => {
  it("lists configurations whose results the record's own table leaves out", () => {
    const linked = unattributedLinkedRecords(query, detail);
    expect(linked.items.map((item) => [item.record.id, item.evaluations, item.results])).toEqual([["unverified", 18, 18]]);
  });

  it("leaves out a record that also has a verified link, such as a version with a pending alias claim", () => {
    const twice = {
      ...(detail as { reverse: unknown[] }),
      reverse: [
        { relation: "configuration_of", record: record("verified") },
        { relation: "alias_of", record: record("verified", "model") },
        { relation: "configuration_of", record: record("unverified") },
      ],
    } as never;
    expect(unattributedLinkedRecords(query, twice).items.map((item) => item.record.id)).toEqual(["unverified"]);
  });

  it("keeps every linked record with results when the record has none of its own", () => {
    expect(linkedResultRecords(query, detail).items.map((item) => item.record.id)).toEqual(["verified", "unverified", "pipeline"]);
  });
});

describe("list summaries", () => {
  it("adds evaluations held on linked records to the row", () => {
    expect(summaryText({ evaluation_count: 14, result_count: 50, linked_evaluation_count: 32, linked_result_count: 86 })).toBe(
      "14 evaluations · 50 results · 18 further evaluations on linked records",
    );
    expect(summaryText({ evaluation_count: 0, result_count: 0, linked_evaluation_count: 240, linked_result_count: 349 })).toBe(
      "240 evaluations · 349 results on linked records",
    );
  });

  it("reads files without linked counts as before", () => {
    expect(summaryText({ evaluation_count: 3, result_count: 4 })).toBe("3 evaluations · 4 results");
    expect(summaryText({ evaluation_count: 0, result_count: 0 })).toBe("No evaluations linked in this release");
  });
});
