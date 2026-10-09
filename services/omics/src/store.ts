import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore";
import type {
  Firestore,
  Query,
  Transaction,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import { contribution, type Contribution } from "./contribution.js";
import { publishedCatalogue, ReleaseNotServed, type PublishedRecord } from "./published-catalogue.js";

export const statuses = [
  "submitted",
  "in_review",
  "changes_requested",
  "rejected",
  "accepted",
  "published",
] as const;
export type Status = (typeof statuses)[number];
export type StoredSubmission = Contribution & {
  id: string;
  uid: string;
  email: string;
  status: Status;
  created_at: string;
  updated_at: string;
  fingerprint: string;
  published_ids?: string[];
  release_id?: string;
  duplicate_ids: string[];
};
const timestamp = () => new Date().toISOString();
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const submissions = (db: Firestore) => db.collection("privateSubmissions");
function fail(
  code: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "TOO_MANY_REQUESTS",
  message: string,
): never {
  throw new TRPCError({ code, message });
}
function owned(doc: DocumentSnapshot, uid: string): StoredSubmission {
  if (!doc.exists || doc.data()?.uid !== uid)
    fail("NOT_FOUND", "Submission not found");
  return doc.data() as StoredSubmission;
}
function visible(data: StoredSubmission) {
  const {
    uid: _uid,
    email: _email,
    fingerprint: _fingerprint,
    duplicate_ids: _duplicates,
    ...output
  } = data;
  return output;
}
async function rateLimit(
  tx: Transaction,
  db: Firestore,
  uid: string,
  operation: string,
  max: number,
) {
  const bucket = Math.floor(Date.now() / 3_600_000);
  const ref = db
    .collection("privateRateLimits")
    .doc(hash(`${uid}:${operation}:${bucket}`));
  const doc = await tx.get(ref);
  if ((doc.data()?.count ?? 0) >= max)
    fail("TOO_MANY_REQUESTS", "Please try again in an hour.");
  return () =>
    tx.set(ref, {
      count: (doc.data()?.count ?? 0) + 1,
      expiresAt: new Date((bucket + 2) * 3_600_000),
    });
}
function revision(
  tx: Transaction,
  ref: FirebaseFirestore.DocumentReference,
  data: StoredSubmission,
  actor: string,
  note = "",
) {
  tx.create(ref.collection("revisions").doc(randomUUID()), {
    created_at: timestamp(),
    actor,
    status: data.status,
    note,
    payload: visible(data),
  });
}
function queueMail(
  tx: Transaction,
  db: Firestore,
  data: StoredSubmission,
  subject: string,
  message: string,
) {
  tx.create(db.collection("privateOutbox").doc(randomUUID()), {
    recipient: data.email,
    subject,
    body: `${message}\n\nView your contribution: ${process.env.PUBLIC_WEB_URL || "http://localhost:3000"}/contribute/\n\nThis message concerns your contribution to rewire.it.`,
    state: "pending",
    attempts: 0,
    available_at: timestamp(),
    created_at: timestamp(),
  });
}
export async function createSubmission(
  db: Firestore,
  user: DecodedIdToken,
  input: Contribution,
  idempotencyKey: string,
) {
  const payload = contribution.parse(input);
  const fingerprint = hash(
    canonicalJson({
      type: payload.type,
      title: payload.title.toLowerCase(),
      source_urls: [...payload.source_urls].sort(),
      details: payload.details,
    }),
  );
  const idem = db
    .collection("privateIdempotency")
    .doc(hash(`${user.uid}:${idempotencyKey}`));
  const payloadHash = hash(canonicalJson(payload));
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(idem);
    if (existing.exists) {
      if (existing.data()?.payload_hash !== payloadHash)
        fail("CONFLICT", "Use a new idempotency key for changed content.");
      const saved = await tx.get(
        submissions(db).doc(existing.data()!.submission_id),
      );
      return {
        id: saved.id,
        status: (saved.data() as StoredSubmission).status,
      };
    }
    const duplicates = await tx.get(
      submissions(db).where("fingerprint", "==", fingerprint).limit(10),
    );
    const bump = await rateLimit(tx, db, user.uid, "create", 20);
    const ref = submissions(db).doc(randomUUID());
    const data: StoredSubmission = {
      ...payload,
      id: ref.id,
      uid: user.uid,
      email: user.email!,
      status: "submitted",
      created_at: timestamp(),
      updated_at: timestamp(),
      fingerprint,
      duplicate_ids: duplicates.docs.map((d) => d.id),
    };
    bump();
    tx.create(ref, data);
    tx.create(idem, { submission_id: ref.id, payload_hash: payloadHash });
    revision(tx, ref, data, "contributor");
    queueMail(
      tx,
      db,
      data,
      "Your rewire.it contribution",
      "Thank you. Your contribution has been received and is awaiting review.",
    );
    return { id: ref.id, status: data.status };
  });
}
export type SubmissionPageInput = { cursor?: string; limit?: number };
async function submissionPage(
  query: Query,
  scope: string,
  direction: "asc" | "desc",
  input: SubmissionPageInput,
) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid page limit" });
  let ordered = query
    .orderBy("created_at", direction)
    .orderBy(FieldPath.documentId(), direction);
  if (input.cursor) {
    try {
      const cursor = JSON.parse(
        Buffer.from(input.cursor, "base64url").toString("utf8"),
      );
      if (
        cursor.scope !== scope ||
        typeof cursor.created_at !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(cursor.created_at) ||
        typeof cursor.id !== "string" ||
        !/^[a-z0-9-]{1,255}$/.test(cursor.id)
      )
        throw new Error("Invalid cursor");
      ordered = ordered.startAfter(cursor.created_at, cursor.id);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cursor does not match this submission list",
      });
    }
  }
  const docs = (await ordered.limit(limit + 1).get()).docs;
  const selected = docs.slice(0, limit);
  const last = selected.at(-1);
  return {
    items: selected.map((doc) => doc.data() as StoredSubmission),
    next_cursor:
      docs.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              scope,
              created_at: last.data().created_at,
              id: last.id,
            }),
          ).toString("base64url")
        : null,
  };
}
export async function listOwn(
  db: Firestore,
  uid: string,
  input: SubmissionPageInput = {},
) {
  const page = await submissionPage(
    submissions(db).where("uid", "==", uid),
    hash(`owner:${uid}`),
    "desc",
    input,
  );
  return { ...page, items: page.items.map(visible) };
}
export async function getOwn(db: Firestore, uid: string, id: string) {
  const ref = submissions(db).doc(id);
  const data = owned(await ref.get(), uid);
  const revisions = await ref
    .collection("revisions")
    .orderBy("created_at")
    .get();
  const history = revisions.docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    ...visible(data),
    revisions: history,
    review_notes: revisions.docs
      .map((d) => d.data())
      .filter((r) => r.actor === "curator" && r.note)
      .map((r) => ({
        note: r.note,
        created_at: r.created_at,
        status: r.status,
      })),
  };
}
export async function updateOwn(
  db: Firestore,
  user: DecodedIdToken,
  id: string,
  patch: Partial<Contribution>,
) {
  const ref = submissions(db).doc(id);
  return db.runTransaction(async (tx) => {
    const existing = owned(await tx.get(ref), user.uid);
    if (!["submitted", "changes_requested"].includes(existing.status))
      fail(
        "CONFLICT",
        "This contribution is locked while reviewed or after a decision.",
      );
    const {
      uid: _uid,
      email: _email,
      id: _id,
      status: _status,
      created_at: _created,
      updated_at: _updated,
      fingerprint: _fingerprint,
      published_ids: _published,
      release_id: _release,
      duplicate_ids: _duplicates,
      ...original
    } = existing;
    const parsed = contribution.parse({ ...original, ...patch });
    const bump = await rateLimit(tx, db, user.uid, "update", 100);
    const fingerprint = hash(
      canonicalJson({
        type: parsed.type,
        title: parsed.title.toLowerCase(),
        source_urls: [...parsed.source_urls].sort(),
        details: parsed.details,
      }),
    );
    const duplicates = await tx.get(
      submissions(db).where("fingerprint", "==", fingerprint).limit(10),
    );
    const data = {
      ...existing,
      ...parsed,
      fingerprint,
      duplicate_ids: duplicates.docs
        .filter((d) => d.id !== id)
        .map((d) => d.id),
      status: "submitted" as const,
      updated_at: timestamp(),
    };
    bump();
    tx.set(ref, data);
    revision(tx, ref, data, "contributor");
    return visible(data);
  });
}
export async function curatorList(
  db: Firestore,
  status?: Status,
  input: SubmissionPageInput = {},
) {
  const query = status
    ? submissions(db).where("status", "==", status)
    : submissions(db);
  return submissionPage(
    query,
    hash(`curator:${status || "all"}`),
    "asc",
    input,
  );
}
const transitions: Record<Status, Status[]> = {
  submitted: ["in_review", "rejected"],
  in_review: ["changes_requested", "rejected", "accepted"],
  changes_requested: ["in_review", "rejected"],
  rejected: ["in_review"],
  accepted: ["published", "changes_requested"],
  published: [],
};
export async function transition(
  db: Firestore,
  id: string,
  status: Status,
  note: string,
  publishedIds: string[] = [],
  releaseId?: string,
) {
  const ref = submissions(db).doc(id);
  // Published records are checked against the live public catalogue before
  // the transaction; the release is immutable, so the answer cannot change.
  let records: (PublishedRecord | null)[] | undefined;
  if (status === "published" && releaseId && publishedIds.length) {
    try {
      records = await publishedCatalogue().records(releaseId, publishedIds);
    } catch (error) {
      if (!(error instanceof ReleaseNotServed)) throw error;
    }
  }
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) fail("NOT_FOUND", "Submission not found");
    const existing = doc.data() as StoredSubmission;
    if (!transitions[existing.status].includes(status))
      fail("CONFLICT", "Invalid review transition");
    if (status === "published") {
      if (!releaseId || !publishedIds.length)
        fail("CONFLICT", "Publication requires released record IDs.");
      if (!records) fail("CONFLICT", "The release is not published.");
      if (
        records.some(
          (record) =>
            !record ||
            ["excluded", "disputed", "superseded"].includes(record.status),
        )
      )
        fail(
          "CONFLICT",
          "Every published record must be present and active in the release.",
        );
      if (existing.type === "correction") {
        if (!existing.target_id || !publishedIds.includes(existing.target_id))
          fail(
            "CONFLICT",
            "Publication must include the corrected target record.",
          );
      } else if (
        !records.some((record) => record?.kind === existing.type)
      ) {
        fail("CONFLICT", "Publication must include the submitted record kind.");
      }
      if (
        existing.type === "result" &&
        !records.some(
          (record) =>
            record?.kind === "result" &&
            ["source_checked", "reproduced"].includes(record.status),
        )
      )
        fail(
          "CONFLICT",
          "Submitted results must be source checked before publication.",
        );
    }
    const data: StoredSubmission = {
      ...existing,
      status,
      updated_at: timestamp(),
    };
    if (status === "published") {
      data.published_ids = publishedIds;
      data.release_id = releaseId;
    }
    tx.set(ref, data);
    revision(tx, ref, data, "curator", note);
    queueMail(
      tx,
      db,
      data,
      `Your rewire.it contribution: ${status.replaceAll("_", " ")}`,
      `Your contribution is now ${status.replaceAll("_", " ")}.\n\n${note}`,
    );
    return visible(data);
  });
}
export async function proposal(db: Firestore, id: string) {
  const doc = await submissions(db).doc(id).get();
  if (!doc.exists) fail("NOT_FOUND", "Submission not found");
  const data = doc.data() as StoredSubmission;
  if (data.status !== "accepted")
    fail(
      "CONFLICT",
      "Only accepted contributions can be exported as review proposals.",
    );
  const { name, affiliation, orcid, public_credit, ...payload } = visible(data);
  // User-entered summaries and evidence still require editorial review for accidental personal data.
  return {
    ...payload,
    public_credit,
    ...(public_credit ? { name, affiliation, orcid } : {}),
    publication_status: "proposal_requires_review",
  };
}
