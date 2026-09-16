import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { contributionHttpHandler, deployedContributionHttpHandler } from "../src/http-handler.js";
import { MAX_REQUEST_BYTES } from "../src/request-limits.js";

test("deployed API stays disabled unless the backend explicitly opts in", async () => {
  const previous = process.env.OMICS_CONTRIBUTIONS_ENABLED;
  delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
  const server = createServer(deployedContributionHttpHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/trpc/submission.list`;
  try {
    const disabled = await fetch(url);
    assert.equal(disabled.status, 503);
    assert.equal(disabled.headers.get("cache-control"), "no-store");
    process.env.OMICS_CONTRIBUTIONS_ENABLED = "true";
    const enabled = await fetch(url);
    assert.equal(enabled.status, 401, "enabling the API must still require verified authentication");
  } finally {
    if (previous === undefined) delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
    else process.env.OMICS_CONTRIBUTIONS_ENABLED = previous;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("Hosting request paths reach authenticated procedures without accepting other prefixes", async () => {
  const server = createServer(contributionHttpHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of [
      "/api/trpc/submission.list",
      "/api/trpc/submission.list?input=%7B%7D",
      "/trpc/submission.list",
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 401, path);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).error.data.code, "UNAUTHORIZED");
    }
    for (const path of [
      "/submission.list",
      "/api/submission.list",
      "/wrong/trpc/submission.list",
      "/api/trpc/",
      "/api/trpc/submission.list/extra",
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "Not found" });
    }
    const oversized = await fetch(base + "/api/trpc/submission.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "x".repeat(MAX_REQUEST_BYTES) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.headers.get("cache-control"), "no-store");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
