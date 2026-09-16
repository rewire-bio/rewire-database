import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
export type Delivery = (mail: {
  recipient: string;
  subject: string;
  body: string;
  messageId: string;
}) => Promise<unknown>;
export async function drainOutbox(
  db: Firestore,
  deliver: Delivery,
  limit = 50,
) {
  const now = () => new Date().toISOString();
  // Due-time ordering prevents delayed retries from starving later ready messages.
  const pending = await db
    .collection("privateOutbox")
    .where("state", "==", "pending")
    .where("available_at", "<=", now())
    .orderBy("available_at")
    .limit(limit)
    .get();
  let sent = 0,
    failed = 0;
  for (const doc of pending.docs) {
    const owner = randomUUID();
    const mail = await db.runTransaction(async (tx) => {
      const current = await tx.get(doc.ref);
      const data = current.data();
      if (
        !data ||
        data.state !== "pending" ||
        data.available_at > now() ||
        (data.lease_until && data.lease_until > now())
      )
        return null;
      tx.update(doc.ref, {
        lease_owner: owner,
        lease_until: new Date(Date.now() + 120_000).toISOString(),
        attempts: data.attempts + 1,
      });
      return data;
    });
    if (!mail) continue;
    try {
      await deliver({
        recipient: mail.recipient,
        subject: mail.subject,
        body: mail.body,
        messageId: `<omics-${doc.id}@rewire.it>`,
      });
      await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (current.data()?.lease_owner === owner)
          tx.update(doc.ref, {
            state: "sent",
            sent_at: now(),
            body: "",
            recipient: "",
            error: null,
          });
      });
      sent++;
    } catch {
      failed++;
      await db.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (current.data()?.lease_owner === owner)
          tx.update(doc.ref, {
            lease_until: null,
            available_at: new Date(
              Date.now() +
                Math.min(86_400, 60 * 2 ** Math.min(mail.attempts, 10)) * 1000,
            ).toISOString(),
            error: "SMTP delivery failed; inspect provider delivery status",
          });
      });
    }
  }
  return { sent, failed };
}
