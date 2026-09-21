import test from "node:test";
import { createServer } from "node:net";
import assert from "node:assert/strict";
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
