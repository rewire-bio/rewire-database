import { describe, expect, it } from "vitest";
import lock from "../benchmark-data.lock.json";
import { GET } from "../app/api/trpc/[trpc]/route";
import { preparedCatalogue, preparedUseCases } from "../lib/prepared";
import { discrepancyApi } from "../lib/agent-connect";
import { generateAgentsMd, generateLlmsTxt } from "../lib/llm-discoverability";

// The public catalogue API answers from the prepared file the pages read.
const call = (procedure: string, input: unknown, init: RequestInit = {}) =>
  GET(new Request(`https://origin.test/api/trpc/catalogue.${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`, init));
const data = async (response: Response) => (await response.json()).result.data;

describe("public catalogue API", () => {
  const query = preparedCatalogue();
  it("serves the embedded release and the reader's answers", async () => {
    expect((await data(await call("release", {}))).release_id).toBe(lock.release_id);
    const input = { release_id: lock.release_id, kind: "model" as const, q: "esm", limit: 5 };
    const response = await call("list", input);
    expect(response.status).toBe(200);
    expect(await data(response)).toEqual(JSON.parse(JSON.stringify(query.list({ kind: "model", q: "esm", limit: 5 }))));
    const id = query.list({ kind: "benchmark", limit: 1 }).items[0].id;
    expect(await data(await call("results", { release_id: lock.release_id, id, limit: 3 })))
      .toEqual(JSON.parse(JSON.stringify(query.results({ id, limit: 3 }))));
    expect((await call("auditRuns", { release_id: lock.release_id, limit: 2 })).status).toBe(404);
  });
  it("answers discrepancy queries from the prepared file, empty when the release has none", async () => {
    const page = await data(await call("discrepancies", { release_id: lock.release_id, settled: "open" }));
    expect(page.available).toBe(query.hasDiscrepancies());
    expect(page.total).toBe(query.discrepancies({ settled: "open" }).total);
    if (!query.hasDiscrepancies()) expect(page.items).toEqual([]);
    expect(await data(await call("discrepancy", { release_id: lock.release_id, id: "discrepancy-0000000000000000" }))).toBeNull();
    expect((await call("discrepancies", { release_id: lock.release_id, severity: "extreme" })).status).toBe(400);
  });
  it("answers every call the agent guides document, and refuses the same calls without release_id", async () => {
    const slug = preparedUseCases(query).list({ limit: 1 }).items[0].slug;
    const documented = [...generateAgentsMd(lock.release_id).matchAll(/GET \/api\/trpc\/catalogue\.(\w+)(?:\?input=(\{[^`]*\}))?`/g)]
      .map(([, procedure, input]) => ({ procedure, input: input ? JSON.parse(input.replace("<slug>", slug)) : {} }));
    expect(documented.map((entry) => entry.procedure)).toEqual(["release", "useCases", "useCase", "list", "discrepancies"]);
    const [list, one] = discrepancyApi(lock.release_id);
    const finding = query.discrepancies({ limit: 1 }).items[0]?.id ?? "discrepancy-0000000000000000";
    documented.push({ procedure: "discrepancies", input: list.example }, { procedure: "discrepancy", input: { ...one.example, id: finding } });
    // /llms.txt prints one call as it is sent, encoded, so it can be fetched as printed.
    const printed = generateLlmsTxt(lock.release_id).match(/Example: GET (https:\/\/\S+)/)?.[1] ?? "";
    expect(printed).not.toMatch(/[{}"]/);
    expect(JSON.parse(new URL(printed).searchParams.get("input") ?? "")).toEqual(list.example);
    expect((await GET(new Request(printed))).status).toBe(200);
    for (const { procedure, input } of documented) {
      expect((await call(procedure, input)).status, procedure).toBe(200);
      if (procedure === "release") continue;
      const { release_id: _, ...unpinned } = input;
      expect((await call(procedure, unpinned)).status, `${procedure} without release_id`).toBe(400);
    }
  });
  it("refuses another release instead of answering from this one", async () => {
    const response = await call("list", { release_id: "2000-01-01-000000000000" });
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).toContain(lock.release_id);
  });
  it("rejects unknown fields and procedures", async () => {
    expect((await call("list", { release_id: lock.release_id, unexpected: 1 })).status).toBe(400);
    expect((await call("missing", { release_id: lock.release_id })).status).toBe(404);
  });
});
