import { createHash } from "node:crypto";
import type {
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { TRPCError } from "@trpc/server";
import {
  applicableChecks,
  auditPage,
  type AuditIndexRow,
  type AuditCheck,
  type AuditRun,
  type AuditResolution,
} from "./audit.js";
type AuditTable = {
  index: AuditIndexRow[];
  runs: AuditRun[];
  resolutions: AuditResolution[];
};
// One release per instance and one in-flight read per release. Concurrent
// requests must not each materialise another full audit index.
const cache = new WeakMap<
  Firestore,
  {
    release: string;
    digest: string;
    pending: Promise<AuditTable>;
  }
>();
async function readTable(db: Firestore, release: string) {
  const ref = db.collection("catalogueReleases").doc(release);
  const meta = (await ref.get()).data();
  if (meta?.state !== "ready" || !meta.published_at)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Published release not found",
    });
  if (!meta.audit_manifest)
    return { index: [], runs: [], resolutions: [], ref, manifest: {} };
  const found = cache.get(db);
  if (found?.release === release && found.digest === meta.digest)
    return { ...(await found.pending), ref, manifest: meta.audit_manifest };
  const pending = (async (): Promise<AuditTable> => {
    const index: AuditIndexRow[] = [];
    let chunkCount = 0;
    for await (const doc of ref
      .collection("auditIndexChunks")
      .orderBy("index")
      .stream() as unknown as AsyncIterable<QueryDocumentSnapshot>) {
      const d = doc.data();
      if (
        createHash("sha256").update(d.rows_json).digest("hex") !==
        meta.audit_manifest.index_chunks[d.index]
      )
        throw Error("Audit index integrity failure");
      index.push(...JSON.parse(d.rows_json));
      chunkCount++;
    }
    if (
      chunkCount !== meta.audit_manifest.index_chunks.length ||
      index.length !== meta.audit_manifest.records
    )
      throw Error("Incomplete audit index");
    return {
      index,
      runs: meta.audit_manifest.runs,
      resolutions: meta.audit_manifest.resolutions,
    };
  })();
  const entry = { release, digest: meta.digest, pending };
  cache.set(db, entry);
  try {
    return { ...(await pending), ref, manifest: meta.audit_manifest };
  } catch (error) {
    if (cache.get(db) === entry) cache.delete(db);
    throw error;
  }
}
export async function auditRuns(
  db: Firestore,
  input: { release_id: string; cursor?: string; limit?: number },
) {
  const data = await readTable(db, input.release_id);
  return {
    release_id: input.release_id,
    ...auditPage(data.runs, input, {
      release: input.release_id,
      table: "runs",
    }),
  };
}
export async function auditRecords(
  db: Firestore,
  input: {
    release_id: string;
    run_id?: string;
    kind?: string;
    outcome?: string;
    category?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
    cursor?: string;
    limit?: number;
  },
) {
  const data = await readTable(db, input.release_id);
  const { cursor, limit, ...scope } = input;
  const items = data.index.filter(
    (r) =>
      r.checks_filter.some(
        (f) =>
          (!input.run_id || f.run_id === input.run_id) &&
          (!input.outcome || f.outcome === input.outcome) &&
          (!input.category || f.category === input.category) &&
          (!input.date_from || f.checked_at.slice(0, 10) >= input.date_from) &&
          (!input.date_to || f.checked_at.slice(0, 10) <= input.date_to),
      ) &&
      (!input.kind || r.record_kind === input.kind) &&
      (!input.q ||
        `${r.record_name} ${r.record_id}`
          .toLowerCase()
          .includes(input.q.toLowerCase())),
  );
  return {
    release_id: input.release_id,
    ...(() => {
      const page = auditPage(items, input, scope);
      return { ...page, items: page.items.map(({ chunk_ids, ...row }) => row) };
    })(),
  };
}
export async function auditChecks(
  db: Firestore,
  input: {
    release_id: string;
    record_id: string;
    run_id?: string;
    outcome?: string;
    category?: string;
    cursor?: string;
    limit?: number;
  },
) {
  const data = await readTable(db, input.release_id);
  const row = data.index.find((r) => r.record_id === input.record_id);
  const { cursor, limit, ...scope } = input;
  const checks: AuditCheck[] = [];
  for (const id of row?.chunk_ids || []) {
    const d = (
      await data.ref.collection("auditCheckChunks").doc(id).get()
    ).data();
    if (
      !d ||
      createHash("sha256").update(d.checks_json).digest("hex") !==
        data.manifest.check_chunks[id]
    )
      throw Error("Audit check integrity failure");
    checks.push(
      ...JSON.parse(d.checks_json).filter(
        (c: AuditCheck) => c.record_id === input.record_id,
      ),
    );
  }
  const record = (
    await data.ref.collection("records").doc(input.record_id).get()
  ).data();
  const sourceIds = [...new Set(checks.flatMap((c) => c.source_ids))];
  const sources = new Map<string, unknown>();
  for (const id of sourceIds)
    sources.set(
      id,
      (await data.ref.collection("records").doc(id).get()).data(),
    );
  const applicable = new Set(
    applicableChecks(checks, record, data.resolutions, sources).map(
      (c) => c.id,
    ),
  );
  return {
    release_id: input.release_id,
    ...auditPage(
      checks
        .map((c) => ({ ...c, applies_to_current_record: applicable.has(c.id) }))
        .filter(
          (c) =>
            (!input.run_id || c.run_id === input.run_id) &&
            (!input.outcome || c.outcome === input.outcome) &&
            (!input.category || c.category === input.category),
        ),
      input,
      scope,
    ),
    record_url: record?.kind
      ? `/database/${record.kind}/${input.record_id}/`
      : null,
    source_urls: Object.fromEntries(
      [...sources].map(([id, source]) => [
        id,
        source ? `/database/source/${id}/` : null,
      ]),
    ),
    resolutions: data.resolutions.filter((r: AuditResolution) =>
      r.check_ids.some((id) => checks.some((c) => c.id === id)),
    ),
  };
}
