import fs from "node:fs";
import path from "node:path";

/** The immutable producer release a running frontend serves. Same shape as
 * benchmark-data.lock.json, which remains the reviewed source of the value. */
export interface DataPin {
  schema_version: 1;
  repository: "rewire-bio/rewire-benchmark-data";
  revision: string;
  manifest_sha256: string;
  release_id: string;
}

export function validDataPin(value: unknown): value is DataPin {
  const pin = value as Partial<DataPin> | null;
  return (
    !!pin &&
    pin.schema_version === 1 &&
    pin.repository === "rewire-bio/rewire-benchmark-data" &&
    /^[a-f0-9]{40}$/.test(pin.revision || "") &&
    /^[a-f0-9]{64}$/.test(pin.manifest_sha256 || "") &&
    /^\d{4}-\d{2}-\d{2}-[a-f0-9]{12}$/.test(pin.release_id || "")
  );
}

let cached: DataPin | undefined;

/**
 * Read at runtime, never compiled in: production sets REWIRE_DATA_PIN on the
 * Cloud Run revision; development and tests use the repository lock file.
 * One revision serves one pin, so every page, API call and download agrees.
 */
export function dataPin(): DataPin {
  if (cached) return cached;
  const raw = process.env.REWIRE_DATA_PIN ?? fs.readFileSync(path.join(process.cwd(), "benchmark-data.lock.json"), "utf8");
  const pin: unknown = JSON.parse(raw);
  if (!validDataPin(pin)) throw new Error("Invalid data pin");
  return (cached = pin);
}

/** Root of the hydrated release files: the container's verified copy, or the checkout. */
export function dataPath(...parts: string[]) {
  return path.join(process.env.REWIRE_DATA_ROOT || process.cwd(), ...parts);
}
