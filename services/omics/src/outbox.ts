import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

export type Delivery = (mail: {
  recipient: string;
  subject: string;
  body: string;
  messageId: string;
  idempotencyKey: string;
  date: Date;
}) => Promise<unknown>;

export class MailDeliveryError extends Error {
  constructor(
    readonly kind: "transient" | "permanent" | "quota",
    readonly retryAfterMs = 300_000,
    readonly ambiguous = false,
  ) {
    // Never retain the provider response: it can contain recipient addresses or credentials.
    super(`Mail delivery ${kind}`);
  }
}
const DAY = 86_400_000;
const IDEMPOTENCY_WINDOW = 23 * 3_600_000;
const MAX_ATTEMPTS = 6;
export interface OutboxOptions {
  now?: () => number;
  dailyLimit?: number;
  monthlyLimit?: number;
}

export async function drainOutbox(
  db: Firestore,
  deliver: Delivery,
  limit = 50,
  options: OutboxOptions = {},
) {
  const clock = options.now || Date.now;
  const iso = (ms = clock()) => new Date(ms).toISOString();
  const dailyLimit = Math.min(options.dailyLimit ?? 100, 100);
  const monthlyLimit = Math.min(options.monthlyLimit ?? 3000, 3000);
  if (![dailyLimit, monthlyLimit].every((n) => Number.isInteger(n) && n > 0))
    throw new Error("Mail quota limits must be positive integers");
  const quotaRef = db.collection("privateMailQuota").doc("resend");
  const pending = await db
    .collection("privateOutbox")
    .where("state", "==", "pending")
    .where("available_at", "<=", iso())
    .orderBy("available_at")
    .limit(limit)
    .get();
  let sent = 0,
    failed = 0;
  for (const doc of pending.docs) {
    const owner = randomUUID();
    const claim = await db.runTransaction(async (tx) => {
      const current = await tx.get(doc.ref);
      const data = current.data();
      const now = clock();
      if (
        !data ||
        data.state !== "pending" ||
        data.available_at > iso(now) ||
        (data.lease_until && data.lease_until > iso(now))
      )
        return null;
      // A process may have died after SMTP accepted its message. Do not retry beyond
      // the provider's 24-hour deduplication window without checking delivery history.
      if (
        (data.uncertain_since &&
          now - Date.parse(data.uncertain_since) >= IDEMPOTENCY_WINDOW) ||
        (data.attempts ?? 0) >= MAX_ATTEMPTS
      ) {
        tx.update(doc.ref, {
          state: "failed",
          failed_at: iso(now),
          lease_owner: null,
          lease_until: null,
          error:
            "Delivery needs curator review; retry safety or attempt limit reached",
        });
        return { exhausted: true as const };
      }
      const quota = (await tx.get(quotaRef)).data();
      // Rolling windows are deliberately stricter than calendar quotas. Reservations
      // include rejected sends, retries and abandoned leases, so uncertain sends cannot
      // accidentally spend the same quota twice. Never release a reservation.
      const reservations: number[] = (quota?.reservations ?? []).filter(
        (value: number) => value > now - 31 * DAY,
      );
      const daily = reservations.filter((value) => value > now - DAY);
      let readyAt = Number(quota?.blocked_until ?? 0);
      if (daily.length >= dailyLimit)
        readyAt = Math.max(readyAt, daily[0] + DAY + 1);
      if (reservations.length >= monthlyLimit)
        readyAt = Math.max(readyAt, reservations[0] + 31 * DAY + 1);
      if (readyAt > now) {
        tx.update(doc.ref, {
          available_at: iso(readyAt),
          error: "Queued until mail quota is available",
        });
        return null;
      }
      tx.set(quotaRef, {
        reservations: [...reservations, now],
        blocked_until: 0,
      });
      tx.update(doc.ref, {
        lease_owner: owner,
        // Outlast the 180-second function timeout before another worker reclaims.
        lease_until: iso(now + 240_000),
        attempts: (data.attempts ?? 0) + 1,
        uncertain_since: data.uncertain_since || iso(now),
      });
      return { exhausted: false as const, data };
    });
    if (!claim) continue;
    if (claim.exhausted) {
      failed++;
      continue;
    }
    const mail = claim.data;
    try {
      await deliver({
        recipient: mail.recipient,
        subject: mail.subject,
        body: mail.body,
        messageId: `<omics-${doc.id}@rewire.it>`,
        idempotencyKey: `rewire-outbox/${doc.id}`,
        date: mail.created_at
          ? new Date(mail.created_at)
          : doc.createTime.toDate(),
      });
      const saved = await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (current.data()?.lease_owner !== owner) return false;
        tx.update(doc.ref, {
          state: "sent",
          sent_at: iso(),
          body: "",
          recipient: "",
          error: null,
          lease_owner: null,
          lease_until: null,
          uncertain_since: null,
        });
        return true;
      });
      if (saved) sent++;
    } catch (error) {
      const failure =
        error instanceof MailDeliveryError
          ? error
          : new MailDeliveryError("transient", 300_000, true);
      if (failure.kind !== "quota") failed++;
      await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (current.data()?.lease_owner !== owner) return;
        const attempts = current.data()?.attempts ?? 1;
        const now = clock();
        const terminal =
          failure.kind === "permanent" ||
          (failure.kind !== "quota" && attempts >= MAX_ATTEMPTS);
        const delay =
          failure.kind === "quota"
            ? failure.retryAfterMs
            : Math.min(3_600_000, 60_000 * 2 ** Math.min(attempts - 1, 6));
        if (failure.kind === "quota") {
          const quota = (await tx.get(quotaRef)).data();
          tx.set(
            quotaRef,
            { blocked_until: Math.max(quota?.blocked_until ?? 0, now + delay) },
            { merge: true },
          );
        }
        tx.update(doc.ref, {
          state: terminal ? "failed" : "pending",
          lease_owner: null,
          lease_until: null,
          available_at: iso(now + delay),
          ...(terminal ? { failed_at: iso(now) } : {}),
          ...(failure.kind === "quota"
            ? { attempts: Math.max(0, attempts - 1) }
            : {}),
          // A definite rejection cannot establish non-delivery of an earlier ambiguous attempt.
          uncertain_since: failure.ambiguous
            ? current.data()?.uncertain_since
            : mail.uncertain_since || null,
          error: terminal
            ? "Delivery failed; curator action required"
            : failure.kind === "quota"
              ? "Queued until provider quota is available"
              : "Delivery temporarily unavailable; retry queued",
        });
      });
    }
  }
  return { sent, failed };
}
