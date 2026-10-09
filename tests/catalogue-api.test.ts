import { describe, expect, it } from "vitest";
import lock from "../benchmark-data.lock.json";
import { GET } from "../app/api/trpc/[trpc]/route";
import { preparedCatalogue } from "../lib/prepared";

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
