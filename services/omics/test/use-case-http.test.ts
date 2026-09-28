import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { deployedContributionHttpHandler } from "../src/http-handler.js";

test("use-case GET procedures retain public validation while contributions are disabled", async () => {
  const previous = process.env.OMICS_CONTRIBUTIONS_ENABLED;
  delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
  const server = createServer(deployedContributionHttpHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/trpc/`;
  try {
    for (const name of ["useCases", "useCase", "useCaseLinks"]) {
      const response = await fetch(
        `${base}catalogue.${name}?input=${encodeURIComponent(JSON.stringify({ release_id: "INVALID RELEASE" }))}`,
      );
      assert.equal(response.status, 400, name);
      assert.equal((await response.json()).error.data.code, "BAD_REQUEST");
      assert.equal(response.headers.get("cache-control"), "no-store");
      const mutation = await fetch(`${base}catalogue.${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(mutation.status, 503);
      const mixed = await fetch(
        `${base}catalogue.${name},submission.list?batch=1`,
      );
      assert.equal(mixed.status, 503);
      assert.equal(mixed.headers.get("cache-control"), "no-store");
    }
  } finally {
    if (previous === undefined) delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
    else process.env.OMICS_CONTRIBUTIONS_ENABLED = previous;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
