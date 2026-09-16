import test from "node:test";
import assert from "node:assert/strict";
import {
  contribution,
  sourceUrl,
  validateSnapshot,
} from "../src/validation.js";
import { fixture } from "./fixtures.js";
test("result proposals require reproducible evidence fields and corrections require target", () => {
  const input = {
    type: "result",
    title: "test",
    summary: "A useful contribution",
    source_urls: ["https://example.org/paper"],
    details: {},
  };
  assert.equal(contribution.safeParse(input).success, false);
  assert.equal(
    contribution.safeParse({
      ...input,
      details: Object.fromEntries(
        [
          "model",
          "benchmark",
          "protocol",
          "metric",
          "value",
          "source_locator",
        ].map((k) => [k, "reported"]),
      ),
    }).success,
    true,
  );
  assert.equal(
    contribution.safeParse({ ...input, type: "correction" }).success,
    false,
  );
});
test("source links refuse local destinations and credentials; no server retrieval exists", () => {
  for (const url of [
    "http://localhost/a",
    "http://127.0.0.1",
    "http://[::1]",
    "http://169.254.169.254",
    "https://user:secret@example.org",
    "ftp://example.org/file",
    "http://foo.internal",
  ])
    assert.equal(sourceUrl.safeParse(url).success, false, url);
  assert.equal(
    sourceUrl.safeParse("https://doi.org/10.1038/example").success,
    true,
  );
});
test("release validation rejects broken provenance, numeric corruption, and duplicate identities", () => {
  assert.equal(validateSnapshot(fixture()).records.length, 6);
  const broken = fixture();
  broken.records[1].source_ids = ["missing"];
  assert.throws(() => validateSnapshot(broken), /Invalid source/);
  const duplicate = fixture();
  duplicate.records.push(duplicate.records[0]);
  assert.throws(() => validateSnapshot(duplicate), /Duplicate/);
  const numeric = fixture();
  numeric.records[5].attributes.numeric_value = "NaN";
  assert.throws(() => validateSnapshot(numeric));
});
test("pre-parsed request limits use actual bytes even without a truthful length header", async () => {
  const { requestTooLarge } = await import("../src/request-limits.js");
  assert.equal(
    requestTooLarge({ headers: {}, rawBody: Buffer.alloc(65_537) }),
    true,
  );
  assert.equal(
    requestTooLarge({
      headers: { "content-length": "1" },
      body: { payload: "x".repeat(65_537) },
    }),
    true,
  );
  assert.equal(
    requestTooLarge({ headers: {}, body: { payload: "é".repeat(40_000) } }),
    true,
  );
  assert.equal(
    requestTooLarge({ headers: {}, body: { payload: "small" } }),
    false,
  );
});
test("contribution details bound Firestore depth, nested arrays and actual UTF-8 bytes", async () => {
  const { proposalInput } = await import("./fixtures.js");
  let nested: any = {};
  for (let i = 0; i < 12; i++) nested = { nested };
  assert.equal(
    contribution.safeParse({ ...proposalInput, details: nested }).success,
    false,
  );
  assert.equal(
    contribution.safeParse({ ...proposalInput, details: { nested: [[1, 2]] } })
      .success,
    false,
  );
  assert.equal(
    contribution.safeParse({
      ...proposalInput,
      details: { text: "é".repeat(13_000) },
    }).success,
    false,
  );
  assert.equal(
    contribution.safeParse({ ...proposalInput, details: { measurement: NaN } })
      .success,
    false,
  );
});
