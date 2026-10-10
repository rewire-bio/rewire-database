import { deflateRawSync, gunzipSync, inflateRawSync } from "node:zlib";
import { useCaseQueryFrom as queryFrom, type UseCaseState } from "../shared/omics/use-cases";

// The prepared file stores every use case's resolved evidence as one gzipped JSON
// blob (about 200 MB unpacked, more than 1 GB once parsed). Pages need one use
// case, one evaluation's results or one record's backlinks at a time, so the blob
// is unpacked once, split into its [key, value] entries by a byte scan, and each
// entry kept compressed. A request parses only the entries it reads. Answers come
// from the shared useCaseQueryFrom over just those entries, so they are the ones
// the full query gives: its lookups, cursors and budgets are per use case,
// mapping or record.

type Section = "mappings" | "results" | "sources";
type Packed = Map<string, Buffer>;

const QUOTE = 0x22, BACKSLASH = 0x5c, OPEN = [0x5b, 0x7b], CLOSE = [0x5d, 0x7d], COMMA = 0x2c, COLON = 0x3a;

/** End (exclusive) of the JSON value starting at `start`. */
function valueEnd(buf: Buffer, start: number): number {
  let depth = 0;
  for (let i = start; i < buf.length; i++) {
    const byte = buf[i];
    if (byte === QUOTE) {
      for (i++; buf[i] !== QUOTE; i++) if (buf[i] === BACKSLASH) i++;
      if (!depth) return i + 1;
    } else if (OPEN.includes(byte)) depth++;
    else if (CLOSE.includes(byte)) {
      if (--depth === 0) return i + 1;
      if (depth < 0) return i;
    } else if (!depth && (byte === COMMA)) return i;
  }
  return buf.length;
}
const skipSpace = (buf: Buffer, i: number) => { while (buf[i] === 0x20 || buf[i] === 0x0a || buf[i] === 0x0d || buf[i] === 0x09) i++; return i; };

/** Byte ranges of a JSON object's top-level values, by key. */
function objectRanges(buf: Buffer): Map<string, [number, number]> {
  const ranges = new Map<string, [number, number]>();
  let i = skipSpace(buf, 0) + 1;
  for (;;) {
    i = skipSpace(buf, i);
    if (buf[i] === CLOSE[1]) return ranges;
    const keyEnd = valueEnd(buf, i);
    const key = JSON.parse(buf.toString("utf8", i, keyEnd)) as string;
    i = skipSpace(buf, keyEnd);
    if (buf[i] !== COLON) throw new Error("Unexpected use-case state layout");
    const start = skipSpace(buf, i + 1), end = valueEnd(buf, start);
    ranges.set(key, [start, end]);
    i = skipSpace(buf, end);
    if (buf[i] === COMMA) i++;
  }
}

/** Each `[key, value]` entry of an array, compressed and keyed by its key. */
function packEntries(buf: Buffer, [start, end]: [number, number]): Packed {
  const packed: Packed = new Map();
  let i = skipSpace(buf, start) + 1;
  while ((i = skipSpace(buf, i)) < end && buf[i] !== CLOSE[0]) {
    const entryEnd = valueEnd(buf, i);
    const keyStart = skipSpace(buf, i + 1);
    const key = JSON.parse(buf.toString("utf8", keyStart, valueEnd(buf, keyStart))) as string;
    packed.set(key, deflateRawSync(buf.subarray(i, entryEnd), { level: 1 }));
    i = skipSpace(buf, entryEnd);
    if (buf[i] === COMMA) i++;
  }
  return packed;
}

/** Kept in its own scope so the unpacked buffer is released once packed. */
function unpack(gz: Uint8Array) {
  const buf = gunzipSync(gz);
  const ranges = objectRanges(buf);
  const parse = <T>(key: string): T => {
    const range = ranges.get(key);
    if (!range) throw new Error(`Use-case state lacks ${key}`);
    return JSON.parse(buf.toString("utf8", ...range)) as T;
  };
  return {
    base: {
      release_id: parse<string>("release_id"),
      input_sha256: parse<string | null>("input_sha256"),
      entries: parse<UseCaseState["entries"]>("entries"),
    },
    backlinks: parse<UseCaseState["backlinks"]>("backlinks"),
    sections: Object.fromEntries((["mappings", "results", "sources"] as const).map((key) => {
      const range = ranges.get(key);
      if (!range) throw new Error(`Use-case state lacks ${key}`);
      return [key, packEntries(buf, range)];
    })) as Record<Section, Packed>,
  };
}

export function createUseCaseStore(gz: Uint8Array) {
  const { base, backlinks, sections } = unpack(gz);
  const entry = <T>(section: Section, key: string): [string, T][] => {
    const packed = sections[section].get(key);
    return packed ? [JSON.parse(inflateRawSync(packed).toString("utf8")) as [string, T]] : [];
  };
  const over = (state: Partial<UseCaseState>) =>
    queryFrom({ ...base, mappings: [], backlinks: [], results: [], sources: [], ...state });
  const all = over({ backlinks });
  type Query = ReturnType<typeof queryFrom>;
  return {
    list: (input?: Parameters<Query["list"]>[0]) => all.list(input),
    links: (input: Parameters<Query["links"]>[0]) => all.links(input),
    get(input: Parameters<Query["get"]>[0]) {
      const found = base.entries.find((u) => u.slug === input.slug);
      if (!found) return null;
      return over({ mappings: entry("mappings", found.id), sources: entry("sources", found.id) }).get(input);
    },
    evaluationResults: (input: Parameters<Query["evaluationResults"]>[0]) =>
      over({ results: entry("results", `${input.mapping_id}|${input.evaluation_id}`) }).evaluationResults(input),
  };
}
