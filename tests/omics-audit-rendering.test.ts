import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AuditExplorer from "../app/audits/AuditExplorer";
describe("public audit table", () => {
  it("labels historical check outcomes separately from a scientific quality grade", () => {
    const html = renderToStaticMarkup(
      createElement(AuditExplorer, {
        releaseId: "release-test",
        runs: [],
        initial: {
          items: [
            {
              record_id: "result-one",
              record_kind: "result",
              record_name: "Source transcription example",
              run_ids: ["run-one"],
              outcomes: ["insufficient_evidence", "supported"],
              categories: ["source_access", "metadata"],
              checks_filter: [],
              check_count: 2,
              latest_check_at: "2026-09-19",
            },
          ],
          total: 1,
          next_cursor: null,
        },
      }),
    );
    expect(html).toContain("not an overall scientific quality grade");
    expect(html).toContain("insufficient evidence, supported");
    expect(html).toContain('href="?record=result-one"');
    for (const label of [
      "Record name or ID",
      "Outcome",
      "All audits",
      "Record type",
      "All checks",
      "View checks",
    ])
      expect(html).toContain(label);
  });
});
