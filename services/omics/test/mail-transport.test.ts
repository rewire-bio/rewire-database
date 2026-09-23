import test from "node:test";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import {
  createGoogleMailDelivery,
  googleMailConfiguration,
} from "../src/google-mail.js";
import { MailDeliveryError } from "../src/outbox.js";
import {
  createMailDelivery,
  smtpConfiguration,
  classifySmtpError,
} from "../src/mail-transport.js";
const production = {
  NODE_ENV: "production",
  SMTP_HOST: "smtp.resend.com",
  SMTP_USER: "resend",
  SMTP_PASSWORD: "test-secret",
  MAIL_FROM: "Rewire <contributions@mail.rewire.it>",
};
test("production SMTP enforces Resend, TLS and credentials", () => {
  const options = smtpConfiguration(production);
  assert.equal(options.secure, true);
  assert.equal(options.port, 465);
  assert.equal(options.requireTLS, true);
  assert.equal(options.tls?.rejectUnauthorized, true);
  assert.equal(options.logger, false);
  assert.equal(options.debug, false);
  assert.throws(() =>
    smtpConfiguration({ ...production, SMTP_HOST: "other.example" }),
  );
  assert.throws(() => smtpConfiguration({ ...production, SMTP_PASSWORD: "" }));
  assert.throws(() => smtpConfiguration({ ...production, MAIL_FROM: "" }));
  assert.throws(() =>
    smtpConfiguration({ ...production, SMTP_SECURE: "false" }),
  );
  assert.equal(
    smtpConfiguration({ ...production, SMTP_PORT: "587", SMTP_SECURE: "false" })
      .requireTLS,
    true,
  );
});
test("Cloud Run counts as production without NODE_ENV", () => {
  assert.throws(() =>
    smtpConfiguration({ K_SERVICE: "mailer", SMTP_HOST: "localhost" }),
  );
});
test("SMTP errors retain classification but not private provider responses", () => {
  const permanent = classifySmtpError({
    responseCode: 550,
    response: "private@example.org unavailable",
  });
  assert.equal(permanent.kind, "permanent");
  assert.equal(permanent.message.includes("private"), false);
  assert.equal(classifySmtpError({ responseCode: 450 }).ambiguous, false);
  assert.equal(classifySmtpError({ code: "ETIMEDOUT" }).ambiguous, true);
  assert.equal(
    classifySmtpError({ responseCode: 550, response: "daily quota exceeded" })
      .kind,
    "quota",
  );
  assert.equal(
    classifySmtpError({ response: "monthly quota exceeded" }).retryAfterMs,
    31 * 86_400_000,
  );
  assert.equal(
    classifySmtpError({ responseCode: 451, response: "rate limit" })
      .retryAfterMs,
    300_000,
  );
});

test("SMTP delivery includes stable provider idempotency, reply-to and plain text", async () => {
  let message = "";
  const server = createServer((socket) => {
    socket.write("220 test SMTP\r\n");
    let buffer = "";
    let inData = false;
    socket.on("data", (bytes) => {
      buffer += bytes.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 queued\r\n");
          } else message += line + "\n";
        } else if (line.startsWith("EHLO")) socket.write("250 test\r\n");
        else if (line === "DATA") {
          inData = true;
          socket.write("354 send message\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const transport = createMailDelivery({
    NODE_ENV: "test",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(address.port),
  });
  try {
    await transport.deliver({
      recipient: "local@example.org",
      subject: "Contribution received",
      body: "Private review item 123",
      messageId: "<omics-123@rewire.it>",
      idempotencyKey: "rewire-outbox/123",
      date: new Date("2026-09-21T00:00:00.000Z"),
    });
    assert.match(message, /Resend-Idempotency-Key: rewire-outbox\/123/i);
    assert.match(message, /Reply-To: tim@rewire.it/i);
    assert.match(message, /Message-ID: <omics-123@rewire.it>/i);
    assert.match(message, /Content-Type: text\/plain/i);
    assert.match(message, /Date: Mon, 21 Sep 2026 00:00:00 \+0000/);
    assert.match(message, /Private review item 123/);
  } finally {
    transport.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

const gmailEnv = {
  MAIL_PROVIDER: "gmail",
  GMAIL_SERVICE_ACCOUNT: "rewire-mail@rewire-it.iam.gserviceaccount.com",
  GMAIL_SENDER: "tim@rewire.it",
};
const exampleMail = {
  recipient: "researcher@example.org",
  subject: "Contribution received",
  body: "Your private review item is 123. This does not publish it.",
  messageId: "<omics-123@rewire.it>",
  idempotencyKey: "rewire-outbox/123",
  date: new Date("2026-09-21T00:00:00.000Z"),
};
function gmailMock(
  send: () => Promise<Response> = async () =>
    Response.json({ id: "message-123" }),
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const request: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith(":signJwt"))
      return Response.json({ signedJwt: "signed.assertion.test" });
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "delegated-test-token",
        expires_in: 3600,
      });
    return send();
  };
  return { calls, request };
}
test("Gmail selection requires delegation config, never SMTP secrets", () => {
  const transport = createMailDelivery(gmailEnv);
  transport.close();
  assert.throws(() =>
    googleMailConfiguration({ ...gmailEnv, GMAIL_SERVICE_ACCOUNT: "" }),
  );
  assert.throws(() =>
    googleMailConfiguration({
      ...gmailEnv,
      GMAIL_SENDER: "tim@rewire.it,other@example.org",
    }),
  );
  assert.throws(() =>
    googleMailConfiguration({
      ...gmailEnv,
      MAIL_REPLY_TO: "tim@rewire.it\r\nBcc: other@example.org",
    }),
  );
  assert.throws(() => createMailDelivery({ MAIL_PROVIDER: "mistyped" }));
});
test("Gmail preflight checks delegated credentials without sending or returning tokens", async () => {
  const mock = gmailMock();
  const transport = createGoogleMailDelivery(gmailEnv, {
    fetch: mock.request,
    accessToken: async () => "adc-test-token",
  });
  assert.equal(await transport.preflight(), undefined);
  assert.equal(mock.calls.length, 2);
  assert.ok(mock.calls.every((call) => !call.url.endsWith("/messages/send")));
  transport.close();
});
test("Gmail uses keyless send-only Workspace delegation and preserves MIME identity", async () => {
  const mock = gmailMock();
  let clock = Date.parse("2026-09-22T00:00:00Z");
  let credentialCalls = 0;
  const transport = createGoogleMailDelivery(gmailEnv, {
    fetch: mock.request,
    now: () => clock,
    accessToken: async () => {
      credentialCalls++;
      return "adc-test-token";
    },
  });
  try {
    assert.deepEqual(await transport.deliver(exampleMail), {
      id: "message-123",
    });
    assert.equal(mock.calls.length, 3);
    const signing = mock.calls[0];
    assert.equal(
      signing.url,
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/rewire-mail@rewire-it.iam.gserviceaccount.com:signJwt",
    );
    assert.equal(
      (signing.init.headers as Record<string, string>).Authorization,
      "Bearer adc-test-token",
    );
    const claims = JSON.parse(JSON.parse(String(signing.init.body)).payload);
    assert.deepEqual(claims, {
      iss: gmailEnv.GMAIL_SERVICE_ACCOUNT,
      sub: "tim@rewire.it",
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      iat: clock / 1000,
      exp: clock / 1000 + 3600,
    });
    const exchange = new URLSearchParams(String(mock.calls[1].init.body));
    assert.equal(exchange.get("assertion"), "signed.assertion.test");
    assert.equal(
      exchange.get("grant_type"),
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    const send = mock.calls[2];
    assert.equal(
      send.url,
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    assert.equal(
      (send.init.headers as Record<string, string>).Authorization,
      "Bearer delegated-test-token",
    );
    const mime = Buffer.from(
      JSON.parse(String(send.init.body)).raw,
      "base64url",
    ).toString();
    assert.match(mime, /From: Rewire <tim@rewire.it>/);
    assert.match(mime, /Reply-To: tim@rewire.it/);
    assert.match(mime, /To: researcher@example.org/);
    assert.match(mime, /Message-ID: <omics-123@rewire.it>/);
    assert.match(mime, /Date: Mon, 21 Sep 2026 00:00:00 \+0000/);
    assert.match(mime, /Content-Type: text\/plain/);
    assert.doesNotMatch(mime, /Resend|Idempotency|Bcc:|text\/html/);
    for (const call of mock.calls) {
      assert.equal(call.init.redirect, "error");
      assert.equal(call.init.method, "POST");
      assert.ok(call.init.signal);
    }
    await transport.deliver(exampleMail);
    assert.equal(mock.calls.length, 4);
    assert.equal(credentialCalls, 1);
    clock += 3_550_000;
    await transport.deliver(exampleMail);
    assert.equal(mock.calls.length, 7);
    assert.equal(credentialCalls, 2);
  } finally {
    transport.close();
  }
});
test("Gmail rejects malformed recipients and headers without requesting credentials", async () => {
  const transport = createGoogleMailDelivery(gmailEnv, {
    accessToken: async () => {
      throw new Error("must not request credentials");
    },
  });
  for (const input of [
    { recipient: "first@example.org,second@example.org" },
    { subject: "Subject\r\nBcc: injected@example.org" },
    { messageId: "<bad>\r\nBcc: injected@example.org" },
    { date: new Date("invalid") },
  ]) {
    await assert.rejects(
      transport.deliver({ ...exampleMail, ...input }),
      (error: unknown) =>
        error instanceof MailDeliveryError &&
        error.kind === "permanent" &&
        !error.ambiguous,
    );
  }
  transport.close();
});
test("Gmail errors distinguish safe rejection from uncertain delivery without leaking responses", async () => {
  const scenarios: [() => Promise<Response>, string, boolean][] = [
    [
      async () =>
        Response.json(
          { error: { message: "secret recipient@example.org" } },
          { status: 401 },
        ),
      "permanent",
      false,
    ],
    [
      async () =>
        Response.json(
          { error: { errors: [{ reason: "dailyLimitExceeded" }] } },
          { status: 403 },
        ),
      "quota",
      false,
    ],
    [async () => Response.json({}, { status: 429 }), "quota", false],
    [async () => Response.json({}, { status: 503 }), "transient", true],
    [
      async () => {
        throw new Error("timeout with secret recipient@example.org");
      },
      "transient",
      true,
    ],
    [async () => Response.json({}), "transient", true],
  ];
  for (const [send, kind, ambiguous] of scenarios) {
    const mock = gmailMock(send);
    const transport = createGoogleMailDelivery(gmailEnv, {
      fetch: mock.request,
      accessToken: async () => "token",
    });
    await assert.rejects(transport.deliver(exampleMail), (error: unknown) => {
      assert.ok(error instanceof MailDeliveryError);
      assert.equal(error.kind, kind);
      assert.equal(error.ambiguous, ambiguous);
      assert.doesNotMatch(error.message, /secret|recipient|token/);
      return true;
    });
    assert.equal(
      mock.calls.length,
      3,
      "the transport never automatically retries a send",
    );
    transport.close();
  }
});
test("Gmail credential and token errors cannot indicate delivered mail", async () => {
  const transport = createGoogleMailDelivery(gmailEnv, {
    accessToken: async () => {
      throw new Error("private credential error");
    },
  });
  await assert.rejects(
    transport.deliver(exampleMail),
    (error: unknown) =>
      error instanceof MailDeliveryError &&
      error.kind === "transient" &&
      !error.ambiguous &&
      !error.message.includes("private"),
  );
  transport.close();
  const calls: string[] = [];
  const failedExchange = createGoogleMailDelivery(gmailEnv, {
    accessToken: async () => "token",
    fetch: async (input) => {
      calls.push(String(input));
      return String(input).endsWith(":signJwt")
        ? Response.json({ signedJwt: "signed" })
        : Response.json(
            { error: "unauthorized_client", error_description: "private" },
            { status: 400 },
          );
    },
  });
  await assert.rejects(
    failedExchange.deliver(exampleMail),
    (error: unknown) =>
      error instanceof MailDeliveryError &&
      error.kind === "permanent" &&
      !error.ambiguous,
  );
  assert.equal(calls.length, 2);
  failedExchange.close();
});
