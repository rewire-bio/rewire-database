import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { recordsDigest } from "../src/catalogue-integrity.js";
function previousCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(previousCanonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, previousCanonical(item)]),
    );
  return value;
}
test("bounded catalogue hashing preserves the historical canonical digest", () => {
  const fixtures = [
    [],
    [
      {
        id: "b",
        attributes: { z: null, a: { unicode: "α", nested: [1, false, "x"] } },
      },
      { id: "a", unknown: undefined, escaped: 'quote"\n' },
    ],
  ];
  for (const records of fixtures) {
    const order = records.map((r) => r.id);
    const old = createHash("sha256")
      .update(
        JSON.stringify(
          previousCanonical(
            [...records].sort((a, b) => a.id.localeCompare(b.id)),
          ),
        ),
      )
      .digest("hex");
    assert.equal(recordsDigest(records), old);
    assert.deepEqual(
      records.map((r) => r.id),
      order,
    );
  }
});
