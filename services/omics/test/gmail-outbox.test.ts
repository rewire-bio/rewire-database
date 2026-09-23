import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { drainOutbox, MailDeliveryError } from "../src/outbox.js";

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
// Separate project so emulator.test.ts can clear its own data concurrently.
const app = enabled
  ? initializeApp(
      { projectId: `demo-gmail-outbox-${process.pid}` },
      "gmail-outbox",
    )
  : null;
const db = app ? getFirestore(app) : null;
let now = Date.parse("2026-09-22T12:00:00Z");
const options = { provider: "gmail" as const, now: () => now };
const gmailTest = (name: string, fn: () => Promise<void>) =>
  test(name, { skip: !enabled }, fn);
beforeEach(async () => {
  now = Date.parse("2026-09-22T12:00:00Z");
  if (db)
    await Promise.all(
      ["privateOutbox", "privateMailQuota"].map((name) =>
        db.recursiveDelete(db.collection(name)),
      ),
    );
});
after(async () => {
  if (db) await db.terminate();
  if (app) await deleteApp(app);
});
async function queued(extra: Record<string, unknown> = {}) {
  const ref = db!.collection("privateOutbox").doc(randomUUID());
  await ref.set({
    recipient: "researcher@example.org",
    subject: "Contribution received",
    body: "Your contribution remains private and pending review.",
    state: "pending",
    available_at: new Date(now - 1).toISOString(),
    created_at: new Date(now - 1).toISOString(),
    attempts: 0,
    ...extra,
  });
  return ref;
}

gmailTest(
  "Gmail ambiguous send is quarantined and never retried automatically",
  async () => {
    const ref = await queued();
    assert.deepEqual(
      await drainOutbox(
        db!,
        async () => {
          throw new Error(
            "Connection lost after send, private provider response",
          );
        },
        50,
        options,
      ),
      { sent: 0, failed: 1 },
    );
    const saved = (await ref.get()).data()!;
    assert.equal(saved.state, "failed");
    assert.equal(saved.delivery_provider, "gmail");
    assert.equal(saved.attempts, 1);
    assert.equal(saved.uncertain_since, new Date(now).toISOString());
    assert.match(saved.error, /curator reconciliation/);
    assert.doesNotMatch(saved.error, /private provider response/);
    now += 86_400_000;
    assert.deepEqual(
      await drainOutbox(
        db!,
        async () => assert.fail("uncertain send must not retry"),
        50,
        options,
      ),
      { sent: 0, failed: 0 },
    );
  },
);
gmailTest(
  "Gmail stale uncertain lease is quarantined within the Resend retry window",
  async () => {
    const ref = await queued({
      attempts: 1,
      lease_owner: "worker-that-exited",
      lease_until: new Date(now - 1).toISOString(),
      uncertain_since: new Date(now - 240_001).toISOString(),
    });
    assert.deepEqual(
      await drainOutbox(
        db!,
        async () => assert.fail("stale Gmail lease must not resend"),
        50,
        options,
      ),
      { sent: 0, failed: 1 },
    );
    assert.equal((await ref.get()).data()?.state, "failed");
    assert.equal((await ref.get()).data()?.attempts, 1);
    assert.equal(
      (await db!.collection("privateMailQuota").doc("gmail").get()).exists,
      false,
    );
  },
);
gmailTest("Gmail active lease stays untouched until it expires", async () => {
  const ref = await queued({
    attempts: 1,
    lease_owner: "live-worker",
    lease_until: new Date(now + 1).toISOString(),
    uncertain_since: new Date(now - 1).toISOString(),
  });
  await drainOutbox(
    db!,
    async () => assert.fail("live worker owns the message"),
    50,
    options,
  );
  assert.equal((await ref.get()).data()?.state, "pending");
  assert.equal((await ref.get()).data()?.lease_owner, "live-worker");
  now += 2;
  await drainOutbox(
    db!,
    async () => assert.fail("expired uncertain lease must quarantine"),
    50,
    options,
  );
  assert.equal((await ref.get()).data()?.state, "failed");
});
gmailTest(
  "Gmail definite rejection retries and success clears private payload",
  async () => {
    const ref = await queued();
    await drainOutbox(
      db!,
      async () => {
        throw new MailDeliveryError("transient");
      },
      50,
      options,
    );
    const rejected = (await ref.get()).data()!;
    assert.equal(rejected.state, "pending");
    assert.equal(rejected.uncertain_since, null);
    now = Date.parse(rejected.available_at);
    assert.deepEqual(
      await drainOutbox(
        db!,
        async (mail) => {
          assert.equal(mail.messageId, `<omics-${ref.id}@rewire.it>`);
          assert.equal(mail.recipient, "researcher@example.org");
        },
        50,
        options,
      ),
      { sent: 1, failed: 0 },
    );
    const sent = (await ref.get()).data()!;
    assert.equal(sent.state, "sent");
    assert.equal(sent.recipient, "");
    assert.equal(sent.body, "");
    assert.equal(sent.uncertain_since, null);
    assert.equal(sent.attempts, 2);
  },
);
gmailTest(
  "Gmail quota rejection holds reservations and blocks other sends",
  async () => {
    const ref = await queued();
    assert.deepEqual(
      await drainOutbox(
        db!,
        async () => {
          throw new MailDeliveryError("quota", 300_000);
        },
        50,
        options,
      ),
      { sent: 0, failed: 0 },
    );
    const saved = (await ref.get()).data()!;
    assert.equal(saved.attempts, 0);
    assert.equal(saved.uncertain_since, null);
    assert.equal(saved.state, "pending");
    const quota = (
      await db!.collection("privateMailQuota").doc("gmail").get()
    ).data()!;
    assert.deepEqual(quota.reservations, [now]);
    assert.equal(quota.blocked_until, now + 300_000);
    assert.equal(
      (await db!.collection("privateMailQuota").doc("resend").get()).exists,
      false,
    );
    const other = await queued();
    await drainOutbox(
      db!,
      async () => assert.fail("provider quota is blocked"),
      50,
      options,
    );
    assert.equal(
      (await other.get()).data()?.available_at,
      new Date(now + 300_000).toISOString(),
    );
  },
);
gmailTest("Gmail definite rejections stop after six attempts", async () => {
  const ref = await queued();
  for (let index = 0; index < 6; index++) {
    await drainOutbox(
      db!,
      async () => {
        throw new MailDeliveryError("transient");
      },
      50,
      options,
    );
    now = Date.parse((await ref.get()).data()!.available_at);
  }
  assert.equal((await ref.get()).data()?.state, "failed");
  assert.equal((await ref.get()).data()?.attempts, 6);
});
gmailTest(
  "Provider changes cannot make an uncertain Gmail send retryable",
  async () => {
    const ref = await queued({
      delivery_provider: "gmail",
      uncertain_since: new Date(now - 300_000).toISOString(),
      attempts: 1,
    });
    await drainOutbox(
      db!,
      async () => assert.fail("Gmail uncertainty survives provider changes"),
      50,
      { now: () => now },
    );
    assert.equal((await ref.get()).data()?.state, "failed");
  },
);
