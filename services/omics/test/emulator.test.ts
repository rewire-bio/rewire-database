import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { appRouter } from "../src/router.js";
import { firebase } from "../src/firebase.js";
import { context } from "../src/auth.js";
import { importRelease } from "../src/catalogue.js";
import { activateRelease } from "../src/catalogue-service.js";
import { drainOutbox } from "../src/outbox.js";
import { fixture, proposalInput } from "./fixtures.js";
import { createAppServer } from "../src/server.js";
import { createServer } from "node:http";
import { contributionHttpHandler } from "../src/http-handler.js";
import { createTRPCClient, httpLink, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../src/router.js";
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
);
const project = process.env.GCLOUD_PROJECT || "demo-rewire-omics";
const authBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
async function authRequest(path: string, body: unknown) {
  const response = await fetch(
    `${authBase}/identitytoolkit.googleapis.com/v1/accounts:${path}?key=demo-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { status: response.status, body: (await response.json()) as any };
}
async function signIn(email = `${randomUUID()}@example.org`) {
  const sent = await authRequest("sendOobCode", {
    requestType: "EMAIL_SIGNIN",
    email,
    continueUrl: "http://localhost:3000/contribute/",
    canHandleCodeInApp: true,
  });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const codes = (await fetch(
    `${authBase}/emulator/v1/projects/${project}/oobCodes`,
  ).then((r) => r.json())) as any;
  const code = codes.oobCodes.findLast((c: any) => c.email === email).oobCode;
  const signed = await authRequest("signInWithEmailLink", {
    email,
    oobCode: code,
  });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  return {
    email,
    code,
    token: signed.body.idToken as string,
    uid: signed.body.localId as string,
  };
}
const emulatorTest = (name: string, run: () => Promise<void>) =>
  test(name, { skip: !enabled }, run);
emulatorTest(
  "Hosting API paths retain authenticated JSON queries and mutations",
  async () => {
    const user = await signIn();
    const server = createServer(contributionHttpHandler);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `http://127.0.0.1:${address.port}/api/trpc`,
          headers: { authorization: `Bearer ${user.token}` },
        }),
      ],
    });
    try {
      const created = await client.submission.create.mutate({
        contribution: proposalInput,
        idempotencyKey: randomUUID(),
      });
      assert.equal(
        (await client.submission.get.query({ id: created.id })).title,
        proposalInput.title,
      );
      await client.submission.update.mutate({
        id: created.id,
        patch: { title: "Hosted API update" },
      });
      assert.equal(
        (await client.submission.get.query({ id: created.id })).title,
        "Hosted API update",
      );
      const [listed, fetched] = await Promise.all([
        client.submission.list.query(),
        client.submission.get.query({ id: created.id }),
      ]);
      assert.equal(listed.items[0].id, fetched.id);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
beforeEach(async () => {
  if (enabled)
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${project}/databases/(default)/documents`,
      { method: "DELETE" },
    );
});
after(async () => {
  if (enabled) await firebase().db.terminate();
});
emulatorTest(
  "Firebase email links are single-use and yield verified identities",
  async () => {
    const user = await signIn();
    const ctx = await context(`Bearer ${user.token}`);
    assert.equal(ctx.user?.email_verified, true);
    assert.notEqual(
      (
        await authRequest("signInWithEmailLink", {
          email: user.email,
          oobCode: user.code,
        })
      ).status,
      200,
    );
    await assert.rejects(() => context("Bearer invalid"), /Sign in/);
    const anonymous = appRouter.createCaller({ user: null });
    await assert.rejects(() => anonymous.submission.list(), /Sign in/);
  },
);
emulatorTest(
  "private submissions enforce ownership, idempotency, revisions and reviewer isolation",
  async () => {
    const one = await signIn();
    const two = await signIn();
    const first = appRouter.createCaller(await context(`Bearer ${one.token}`));
    const second = appRouter.createCaller(await context(`Bearer ${two.token}`));
    const key = randomUUID();
    const submitted = await first.submission.create({
      contribution: proposalInput,
      idempotencyKey: key,
    });
    const repeated = await first.submission.create({
      contribution: proposalInput,
      idempotencyKey: key,
    });
    assert.equal(submitted.id, repeated.id);
    await assert.rejects(
      () =>
        first.submission.create({
          contribution: { ...proposalInput, title: "changed" },
          idempotencyKey: key,
        }),
      /idempotency/,
    );
    assert.equal((await first.submission.list()).items.length, 1);
    assert.equal((await second.submission.list()).items.length, 0);
    await assert.rejects(
      () => second.submission.get({ id: submitted.id }),
      /not found/,
    );
    await assert.rejects(
      () =>
        second.submission.update({
          id: submitted.id,
          patch: { title: "Hijack" },
        }),
      /not found/,
    );
    await assert.rejects(() => first.curator.list({}), /Curator/);
    await first.submission.update({
      id: submitted.id,
      patch: { title: "Corrected title" },
    });
    const data = await first.submission.get({ id: submitted.id });
    assert.equal(data.title, "Corrected title");
    assert.equal(data.revisions.length, 2);
    assert.equal(JSON.stringify(data).includes(one.email), false);
    assert.equal("uid" in data, false);
  },
);
emulatorTest(
  "review decisions require actual published IDs and preserve private audit history",
  async () => {
    const one = await signIn();
    const base = await context(`Bearer ${one.token}`);
    const author = appRouter.createCaller(base);
    const curator = appRouter.createCaller({
      user: { ...base.user!, curator: true },
    });
    const created = await author.submission.create({
      contribution: proposalInput,
      idempotencyKey: randomUUID(),
    });
    await assert.rejects(
      () =>
        curator.curator.transition({
          id: created.id,
          status: "accepted",
          note: "Skipped review",
        }),
      /Invalid review/,
    );
    await curator.curator.transition({
      id: created.id,
      status: "in_review",
      note: "Checking evidence",
    });
    await assert.rejects(
      () =>
        author.submission.update({
          id: created.id,
          patch: { title: "Race review" },
        }),
      /locked/,
    );
    await curator.curator.transition({
      id: created.id,
      status: "changes_requested",
      note: "Please clarify inputs",
    });
    await author.submission.update({
      id: created.id,
      patch: { summary: "Inputs and missing details have now been clarified." },
    });
    await curator.curator.transition({
      id: created.id,
      status: "in_review",
      note: "Checking revision",
    });
    await curator.curator.transition({
      id: created.id,
      status: "accepted",
      note: "Reviewed and accepted for a future release",
    });
    await assert.rejects(
      () =>
        curator.curator.transition({
          id: created.id,
          status: "published",
          note: "Publishing",
        }),
      /requires released/,
    );
    const snapshot = Buffer.from(JSON.stringify(fixture()));
    const manifest = {
      release_id: "test-release",
      schema_version: "1.0",
      catalogue_sha256: createHash("sha256").update(snapshot).digest("hex"),
    };
    await importRelease(firebase().db, snapshot, manifest);
    await assert.rejects(
      () =>
        curator.curator.transition({
          id: created.id,
          status: "published",
          note: "Not activated",
          releaseId: "test-release",
          publishedIds: ["model-one"],
        }),
      /not published/,
    );
    await activateRelease(firebase().db, "test-release");
    await assert.rejects(
      () =>
        curator.curator.transition({
          id: created.id,
          status: "published",
          note: "Publishing",
          releaseId: "test-release",
          publishedIds: ["missing"],
        }),
      /Every published/,
    );
    const published = await curator.curator.transition({
      id: created.id,
      status: "published",
      note: "Available in the reviewed release",
      releaseId: "test-release",
      publishedIds: ["model-one"],
    });
    assert.equal(published.status, "published");
    await assert.rejects(
      () =>
        author.submission.update({
          id: created.id,
          patch: { title: "After publication" },
        }),
      /locked/,
    );
    assert.ok(
      (await author.submission.get({ id: created.id })).review_notes.length >=
        4,
    );
  },
);
emulatorTest(
  "release imports validate checksums, are immutable and idempotent",
  async () => {
    const snapshot = Buffer.from(JSON.stringify(fixture()));
    const manifest = {
      release_id: "test-release",
      schema_version: "1.0",
      catalogue_sha256: createHash("sha256").update(snapshot).digest("hex"),
    };
    await assert.rejects(
      () =>
        importRelease(firebase().db, snapshot, {
          ...manifest,
          catalogue_sha256: "wrong",
        }),
      /hash/,
    );
    assert.equal(
      (await importRelease(firebase().db, snapshot, manifest)).imported,
      true,
    );
    assert.equal(
      (await importRelease(firebase().db, snapshot, manifest)).imported,
      false,
    );
    const changed = Buffer.from(
      JSON.stringify({ ...fixture(), coverage: { changed: true } }),
    );
    await assert.rejects(
      () =>
        importRelease(firebase().db, changed, {
          ...manifest,
          catalogue_sha256: createHash("sha256").update(changed).digest("hex"),
        }),
      /immutable/,
    );
  },
);
emulatorTest(
  "outbox retries failure, drains once and redacts delivered body and recipient",
  async () => {
    const user = await signIn();
    const caller = appRouter.createCaller(
      await context(`Bearer ${user.token}`),
    );
    await caller.submission.create({
      contribution: proposalInput,
      idempotencyKey: randomUUID(),
    });
    assert.deepEqual(
      await drainOutbox(firebase().db, async () => {
        throw new Error("SMTP offline");
      }),
      { sent: 0, failed: 1 },
    );
    const docs = await firebase().db.collection("privateOutbox").get();
    await docs.docs[0].ref.update({ available_at: "2000-01-01T00:00:00.000Z" });
    let count = 0;
    assert.deepEqual(
      await drainOutbox(firebase().db, async (mail) => {
        assert.equal(mail.recipient, user.email);
        assert.ok(mail.body.includes("http://localhost:3000/contribute/"));
        assert.equal(mail.body.includes("/benchmarks/contribute/"), false);
        count++;
      }),
      { sent: 1, failed: 0 },
    );
    await drainOutbox(firebase().db, async () => {
      count++;
    });
    assert.equal(count, 1);
    const stored = (await docs.docs[0].ref.get()).data();
    assert.equal(stored?.recipient, "");
    assert.equal(stored?.body, "");
  },
);
emulatorTest(
  "per-account rate limiting rejects excess mutations atomically",
  async () => {
    const user = await signIn();
    const caller = appRouter.createCaller(
      await context(`Bearer ${user.token}`),
    );
    for (let n = 0; n < 20; n++)
      await caller.submission.create({
        contribution: proposalInput,
        idempotencyKey: randomUUID(),
      });
    await assert.rejects(
      () =>
        caller.submission.create({
          contribution: proposalInput,
          idempotencyKey: randomUUID(),
        }),
      /hour/,
    );
    assert.equal((await caller.submission.list()).items.length, 20);
  },
);

emulatorTest(
  "HTTP transport verifies tokens, enforces CORS and serialises contribution calls",
  async () => {
    const user = await signIn();
    const server = createAppServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const client = createTRPCClient<AppRouter>({
        links: [
          httpLink({
            url: base + "/trpc",
            headers: { authorization: `Bearer ${user.token}` },
          }),
        ],
      });
      const created = await client.submission.create.mutate({
        contribution: proposalInput,
        idempotencyKey: randomUUID(),
      });
      assert.equal(
        (await client.submission.get.query({ id: created.id })).title,
        proposalInput.title,
      );
      assert.equal(
        (
          await fetch(base + "/trpc/submission.list", {
            headers: { Origin: "https://untrusted.example" },
          })
        ).status,
        403,
      );
      assert.equal((await fetch(base + "/trpc/submission.list")).status, 401);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
emulatorTest(
  "unverified and disabled identities cannot use the contribution service",
  async () => {
    const signup = await authRequest("signUp", {
      email: `${randomUUID()}@example.org`,
      password: "test-only-strong-password",
      returnSecureToken: true,
    });
    assert.equal(signup.status, 200);
    await assert.rejects(
      () => context(`Bearer ${signup.body.idToken}`),
      /Sign in/,
    );
    const user = await signIn();
    await firebase().auth.updateUser(user.uid, { disabled: true });
    await assert.rejects(() => context(`Bearer ${user.token}`), /Sign in/);
  },
);
emulatorTest(
  "direct Firestore clients cannot read private records",
  async () => {
    const user = await signIn();
    const caller = appRouter.createCaller(
      await context(`Bearer ${user.token}`),
    );
    const result = await caller.submission.create({
      contribution: proposalInput,
      idempotencyKey: randomUUID(),
    });
    const response = await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/privateSubmissions/${result.id}`,
      { headers: { Authorization: `Bearer ${user.token}` } },
    );
    assert.equal(response.status, 403);
  },
);

emulatorTest(
  "concurrent retries create one contribution, revision and receipt",
  async () => {
    const user = await signIn();
    const caller = appRouter.createCaller(
      await context(`Bearer ${user.token}`),
    );
    const idempotencyKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        caller.submission.create({
          contribution: { ...proposalInput, details: { a: 1, b: 2 } },
          idempotencyKey,
        }),
      ),
    );
    assert.equal(new Set(results.map((result) => result.id)).size, 1);
    const reversed = await caller.submission.create({
      contribution: { ...proposalInput, details: { b: 2, a: 1 } },
      idempotencyKey,
    });
    assert.equal(reversed.id, results[0].id);
    assert.equal(
      (await caller.submission.get({ id: reversed.id })).revisions.length,
      1,
    );
    assert.equal(
      (await firebase().db.collection("privateOutbox").get()).size,
      1,
    );
  },
);
emulatorTest(
  "concurrent outbox workers claim once and abandoned leases recover",
  async () => {
    const user = await signIn();
    const caller = appRouter.createCaller(
      await context(`Bearer ${user.token}`),
    );
    await caller.submission.create({
      contribution: proposalInput,
      idempotencyKey: randomUUID(),
    });
    let deliveries = 0;
    const deliver = async () => {
      deliveries++;
      await new Promise((resolve) => setTimeout(resolve, 20));
    };
    const outcomes = await Promise.all([
      drainOutbox(firebase().db, deliver),
      drainOutbox(firebase().db, deliver),
    ]);
    assert.equal(deliveries, 1);
    assert.equal(
      outcomes.reduce((n, o) => n + o.sent, 0),
      1,
    );
    await caller.submission.create({
      contribution: proposalInput,
      idempotencyKey: randomUUID(),
    });
    const pending = await firebase()
      .db.collection("privateOutbox")
      .where("state", "==", "pending")
      .get();
    await pending.docs[0].ref.update({
      lease_owner: "crashed-worker",
      lease_until: "2000-01-01T00:00:00.000Z",
    });
    assert.equal((await drainOutbox(firebase().db, deliver)).sent, 1);
    assert.equal(deliveries, 2);
  },
);
emulatorTest(
  "expired identity tokens are refused by Firebase verification",
  async () => {
    const user = await signIn();
    const [header, payload, signature] = user.token.split(".");
    // Only emulator tokens have an unsigned signature; production verifies it too.
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    claims.exp = Math.floor(Date.now() / 1000) - 3600;
    const expired = [
      header,
      Buffer.from(JSON.stringify(claims)).toString("base64url"),
      signature,
    ].join(".");
    await assert.rejects(() => context(`Bearer ${expired}`), /Sign in/);
  },
);
emulatorTest(
  "publication guard requires matching kinds and checked result evidence",
  async () => {
    const user = await signIn();
    const ctx = await context(`Bearer ${user.token}`);
    const author = appRouter.createCaller(ctx),
      curator = appRouter.createCaller({
        user: { ...ctx.user!, curator: true },
      });
    const input = {
      ...proposalInput,
      type: "result" as const,
      details: {
        model: "model-one",
        benchmark: "benchmark-one",
        protocol: "protocol-one",
        metric: "AUROC",
        value: "0.8",
        source_locator: "Table 1",
      },
    };
    const submitted = await author.submission.create({
      contribution: input,
      idempotencyKey: randomUUID(),
    });
    await curator.curator.transition({
      id: submitted.id,
      status: "in_review",
      note: "Reviewing source",
    });
    await curator.curator.transition({
      id: submitted.id,
      status: "accepted",
      note: "Accepted extraction",
    });
    const snapshot = fixture();
    snapshot.release_id = "unchecked-release";
    snapshot.records[5].status = "needs_review";
    const bytes = Buffer.from(JSON.stringify(snapshot));
    await importRelease(firebase().db, bytes, {
      release_id: snapshot.release_id,
      schema_version: "1.0",
      catalogue_sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    await activateRelease(firebase().db, snapshot.release_id);
    await assert.rejects(
      () =>
        curator.curator.transition({
          id: submitted.id,
          status: "published",
          note: "Publishing",
          releaseId: snapshot.release_id,
          publishedIds: ["model-one"],
        }),
      /record kind/,
    );
    await assert.rejects(
      () =>
        curator.curator.transition({
          id: submitted.id,
          status: "published",
          note: "Publishing",
          releaseId: snapshot.release_id,
          publishedIds: ["result-one"],
        }),
      /source checked/,
    );
    assert.equal(
      (await author.submission.get({ id: submitted.id })).status,
      "accepted",
    );
  },
);
emulatorTest(
  "proposal export honours attribution consent and never exports private identifiers",
  async () => {
    const user = await signIn();
    const ctx = await context(`Bearer ${user.token}`);
    const author = appRouter.createCaller(ctx),
      curator = appRouter.createCaller({
        user: { ...ctx.user!, curator: true },
      });
    const submitted = await author.submission.create({
      contribution: {
        ...proposalInput,
        name: "Private Name",
        affiliation: "Private Affiliation",
      },
      idempotencyKey: randomUUID(),
    });
    await curator.curator.transition({
      id: submitted.id,
      status: "in_review",
      note: "Reviewing source",
    });
    await curator.curator.transition({
      id: submitted.id,
      status: "accepted",
      note: "Accepted extraction",
    });
    const proposal = await curator.curator.proposal({ id: submitted.id });
    for (const key of [
      "email",
      "uid",
      "name",
      "affiliation",
      "orcid",
      "duplicate_ids",
      "fingerprint",
    ])
      assert.equal(key in proposal, false, key);
    assert.equal(JSON.stringify(proposal).includes(user.email), false);
    await curator.curator.transition({
      id: submitted.id,
      status: "changes_requested",
      note: "Optional credit can be revised",
    });
    await author.submission.update({
      id: submitted.id,
      patch: { public_credit: true },
    });
    await curator.curator.transition({
      id: submitted.id,
      status: "in_review",
      note: "Reviewing revision",
    });
    await curator.curator.transition({
      id: submitted.id,
      status: "accepted",
      note: "Accepted consent revision",
    });
    const credited = await curator.curator.proposal({ id: submitted.id });
    assert.equal(credited.name, "Private Name");
    assert.equal(credited.affiliation, "Private Affiliation");
    assert.equal("email" in credited, false);
  },
);

emulatorTest(
  "submission cursor pages cover queues beyond 200, including timestamp ties and changed membership",
  async () => {
    const user = await signIn();
    const ctx = await context(`Bearer ${user.token}`);
    const author = appRouter.createCaller(ctx),
      curator = appRouter.createCaller({
        user: { ...ctx.user!, curator: true },
      });
    const original = await author.submission.create({
      contribution: proposalInput,
      idempotencyKey: randomUUID(),
    });
    const base = (
      await firebase()
        .db.collection("privateSubmissions")
        .doc(original.id)
        .get()
    ).data()!;
    const batch = firebase().db.batch();
    for (let i = 0; i < 201; i++) {
      const id = `copy-${String(i).padStart(4, "0")}`;
      batch.set(firebase().db.collection("privateSubmissions").doc(id), {
        ...base,
        id,
        created_at: new Date(
          Date.UTC(2000, 0, 1) + Math.floor(i / 5) * 1000,
        ).toISOString(),
      });
    }
    await batch.commit();
    const personal = await author.submission.list({ limit: 200 });
    assert.equal(personal.items.length, 200);
    assert.equal(personal.items[0].id, original.id);
    assert.equal(personal.items[1].id, "copy-0200");
    assert.ok(personal.next_cursor);
    const remaining = await author.submission.list({
      cursor: personal.next_cursor,
    });
    assert.equal(remaining.items.length, 2);
    assert.equal(remaining.next_cursor, null);
    assert.equal(
      new Set([...personal.items, ...remaining.items].map((r) => r.id)).size,
      202,
    );
    assert.ok(
      [...personal.items, ...remaining.items].every(
        (r) => !("email" in r) && !("uid" in r),
      ),
    );
    const other = appRouter.createCaller(
      await context(`Bearer ${(await signIn()).token}`),
    );
    await assert.rejects(
      () => other.submission.list({ cursor: personal.next_cursor! }),
      /Cursor/,
    );
    await assert.rejects(
      () => author.submission.list({ cursor: "broken" }),
      /Cursor/,
    );
    const queue = await curator.curator.list({
      status: "submitted",
      limit: 200,
    });
    assert.equal(queue.items.length, 200);
    assert.equal(queue.items[0].id, "copy-0000");
    assert.ok(queue.next_cursor);
    // A value cursor keeps working if its boundary row leaves the filtered queue.
    await firebase()
      .db.collection("privateSubmissions")
      .doc(queue.items.at(-1)!.id)
      .update({ status: "in_review" });
    const tail = await curator.curator.list({
      status: "submitted",
      cursor: queue.next_cursor,
    });
    assert.equal(tail.items.length, 2);
    assert.equal(tail.items.at(-1)!.id, original.id);
    assert.equal(tail.next_cursor, null);
    assert.equal(
      new Set([...queue.items, ...tail.items].map((r) => r.id)).size,
      202,
    );
    await assert.rejects(
      () =>
        curator.curator.list({
          status: "in_review",
          cursor: queue.next_cursor!,
        }),
      /Cursor/,
    );
    await assert.rejects(
      () => author.submission.list({ cursor: queue.next_cursor! }),
      /Cursor/,
    );
  },
);

emulatorTest(
  "published catalogue HTTP queries remain public with contributions disabled and roll back atomically",
  async () => {
    const { activateRelease } = await import("../src/catalogue-service.js");
    const { deployedContributionHttpHandler } =
      await import("../src/http-handler.js");
    const snapshot = fixture();
    snapshot.release_id = "catalogue-public-one";
    const bytes = Buffer.from(JSON.stringify(snapshot));
    await importRelease(firebase().db, bytes, {
      release_id: snapshot.release_id,
      schema_version: snapshot.schema_version,
      catalogue_sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    const anonymous = appRouter.createCaller({ user: null });
    await assert.rejects(
      () => anonymous.catalogue.release({ release_id: snapshot.release_id }),
      /not found/,
    );
    await activateRelease(firebase().db, snapshot.release_id);
    assert.equal(
      (await anonymous.catalogue.release()).release_id,
      snapshot.release_id,
    );
    const server = createServer(deployedContributionHttpHandler);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/trpc`;
    const previous = process.env.OMICS_CONTRIBUTIONS_ENABLED;
    delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
    try {
      const publicClient = createTRPCClient<AppRouter>({
        links: [httpBatchLink({ url: base })],
      });
      const [detail, results] = await Promise.all([
        publicClient.catalogue.get.query({
          release_id: snapshot.release_id,
          id: "model-one",
        }),
        publicClient.catalogue.results.query({
          release_id: snapshot.release_id,
          id: "model-one",
        }),
      ]);
      assert.equal(detail?.record.id, "model-one");
      assert.equal(results.items[0].sources[0].id, "source-one");
      const chart = await publicClient.catalogue.comparison.query({
        release_id: snapshot.release_id, id: "model-one", panel_id: "unknown",
      });
      assert.equal(chart.release_id, snapshot.release_id);
      assert.equal(chart.panel, null);
      const response = await fetch(
        `${base}/catalogue.release?input=${encodeURIComponent(JSON.stringify({ release_id: snapshot.release_id }))}`,
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") || "", /^public/);
      const privateResponse = await fetch(`${base}/submission.list`);
      assert.equal(privateResponse.status, 503);
      assert.equal(privateResponse.headers.get("cache-control"), "no-store");
      const mixed = await fetch(
        `${base}/catalogue.release,submission.list?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: {}, 1: {} }))}`,
      );
      assert.equal(mixed.status, 503);
      assert.equal(mixed.headers.get("cache-control"), "no-store");
      snapshot.release_id = "catalogue-public-two";
      const next = Buffer.from(JSON.stringify(snapshot));
      await importRelease(firebase().db, next, {
        release_id: snapshot.release_id,
        schema_version: snapshot.schema_version,
        catalogue_sha256: createHash("sha256").update(next).digest("hex"),
      });
      await activateRelease(firebase().db, snapshot.release_id);
      assert.equal(
        (await anonymous.catalogue.release()).release_id,
        "catalogue-public-two",
      );
      assert.equal(
        (
          await anonymous.catalogue.release({
            release_id: "catalogue-public-one",
          })
        ).release_id,
        "catalogue-public-one",
      );
      await activateRelease(firebase().db, "catalogue-public-one");
      assert.equal(
        (await anonymous.catalogue.release()).release_id,
        "catalogue-public-one",
      );
      await firebase()
        .db.doc("catalogueReleases/incomplete-release")
        .set({ state: "staging", record_count: 1 });
      await assert.rejects(
        () => activateRelease(firebase().db, "incomplete-release"),
        /complete/,
      );
    } finally {
      if (previous === undefined)
        delete process.env.OMICS_CONTRIBUTIONS_ENABLED;
      else process.env.OMICS_CONTRIBUTIONS_ENABLED = previous;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  },
);

emulatorTest(
  "release publication refuses damaged records or incomplete serving snapshots",
  async () => {
    const { activateRelease } = await import("../src/catalogue-service.js");
    const snapshot = fixture();
    snapshot.release_id = "catalogue-damaged-release";
    const bytes = Buffer.from(JSON.stringify(snapshot));
    await importRelease(firebase().db, bytes, {
      release_id: snapshot.release_id,
      schema_version: snapshot.schema_version,
      catalogue_sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    const ref = firebase()
      .db.collection("catalogueReleases")
      .doc(snapshot.release_id);
    await ref
      .collection("records")
      .doc("model-one")
      .update({ name: "Unexpected change" });
    await assert.rejects(
      () => activateRelease(firebase().db, snapshot.release_id),
      /integrity/,
    );
    assert.equal(
      (await firebase().db.doc("cataloguePublication/active").get()).exists,
      false,
    );
    await ref
      .collection("records")
      .doc("model-one")
      .update({ name: "model-one" });
    await ref.collection("queryChunks").doc("000000").delete();
    await assert.rejects(
      () => activateRelease(firebase().db, snapshot.release_id),
      /Incomplete/,
    );
    assert.equal(
      (await firebase().db.doc("cataloguePublication/active").get()).exists,
      false,
    );
  },
);

emulatorTest(
  "raw Python-compatible SDK POST is private, idempotent and owned by verified email",
  async () => {
    const { sdkBundle: bundle } = await import("./fixtures.js");
    const user = await signIn();
    const other = await signIn();
    const server = createServer(contributionHttpHandler);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/trpc`;
    const payload = {
      contribution: {
        type: "result",
        title: "Locally evaluated private model",
        summary: "Prepared locally and submitted for review.",
        source_urls: ["https://example.org/results"],
        public_credit: false,
        details: {
          model: "Private model",
          benchmark: "MFASS",
          protocol: "mfass-v2",
          metric: "AUROC",
          value: "0.77",
          source_locator: "Table 1",
          rewire_bundle: bundle,
        },
      },
      idempotencyKey: randomUUID(),
    };
    const post = (token?: string, body = payload) =>
      fetch(`${base}/submission.create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    try {
      assert.equal((await post()).status, 401);
      const created = await post(user.token);
      assert.equal(created.status, 200);
      const first = (await created.json()) as any;
      assert.equal(first.result.data.status, "submitted");
      assert.deepEqual(await (await post(user.token)).json(), first);
      const foreign = await fetch(
        `${base}/submission.get?input=${encodeURIComponent(JSON.stringify({ id: first.result.data.id }))}`,
        { headers: { Authorization: `Bearer ${other.token}` } },
      );
      assert.equal(foreign.status, 404);
      const original = await fetch(
        `${base}/submission.get?input=${encodeURIComponent(JSON.stringify({ id: first.result.data.id }))}`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      const own = (await original.json()) as any;
      assert.equal(
        own.result.data.details.rewire_bundle.review_status,
        "unreviewed_contribution",
      );
      assert.equal(original.headers.get("cache-control"), "no-store");
      const rejected = await post(user.token, {
        ...payload,
        idempotencyKey: randomUUID(),
        contribution: {
          ...payload.contribution,
          details: {
            ...payload.contribution.details,
            rewire_bundle: { ...bundle, independently_reproduced: true },
          },
        },
      });
      assert.equal(rejected.status, 400);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
