import { describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@trpc/client", () => ({ createTRPCUntypedClient: () => ({ query }), httpLink: () => ({}) }));
import { createUseCasesClient } from "../lib/use-cases-client";

describe("use-case browser release consistency", () => {
  it("uses the public procedures with one pinned release and no contributor credentials", async () => {
    query.mockResolvedValue({ release_id: "fixture", input_sha256: "digest", items: [] });
    const client = createUseCasesClient("fixture", "digest");
    await client.list({ q: "RNA", limit: 10 }); await client.get({ slug: "splicing" }); await client.links({ id: "model" });
    expect(query.mock.calls.slice(-3).map((call) => call[0])).toEqual(["catalogue.useCases", "catalogue.useCase", "catalogue.useCaseLinks"]);
    for (const call of query.mock.calls.slice(-3)) expect(call[1]).toHaveProperty("release_id", "fixture");
  });
  it("rejects a foreign release or changed content digest", async () => {
    for (const response of [{ release_id: "other", input_sha256: "digest" }, { release_id: "fixture", input_sha256: "other" }, { release_id: "fixture" }]) {
      query.mockResolvedValue(response);
      await expect(createUseCasesClient("fixture", "digest").list({})).rejects.toThrow("consistent release");
    }
  });
  it("permits empty legacy-release collections and missing detail", async () => {
    query.mockResolvedValueOnce({ release_id: "legacy", input_sha256: null, items: [] }).mockResolvedValueOnce(null);
    expect(await createUseCasesClient("legacy", null).list({})).toMatchObject({ items: [] });
    expect(await createUseCasesClient("legacy", null).get({ slug: "absent" })).toBeNull();
  });
});
