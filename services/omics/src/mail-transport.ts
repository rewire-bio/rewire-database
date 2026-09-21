import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { MailDeliveryError, type Delivery } from "./outbox.js";

export function smtpConfiguration(
  env: NodeJS.ProcessEnv,
): SMTPTransport.Options {
  if (!env.SMTP_HOST)
    throw new Error(
      "SMTP_HOST must be configured; no emails are sent by default",
    );
  const production = env.NODE_ENV === "production" || !!env.K_SERVICE;
  const port = Number(env.SMTP_PORT || (production ? 465 : 1025));
  const secure =
    env.SMTP_SECURE === "true" ||
    (env.SMTP_SECURE === undefined && port === 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid SMTP_PORT");
  if (
    production &&
    (env.SMTP_HOST !== "smtp.resend.com" ||
      env.SMTP_USER !== "resend" ||
      !env.SMTP_PASSWORD ||
      !env.MAIL_FROM ||
      ![465, 587, 2465, 2587].includes(port))
  )
    throw new Error(
      "Production requires the verified Resend SMTP configuration",
    );
  if (
    production &&
    (([465, 2465].includes(port) && !secure) ||
      ([587, 2587].includes(port) && secure))
  )
    throw new Error("SMTP security does not match the selected port");
  return {
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: production,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    logger: false,
    debug: false,
  };
}

export function classifySmtpError(error: unknown): MailDeliveryError {
  const data =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = Number(data.responseCode);
  // Inspect in memory only. Never persist or log raw SMTP replies.
  const response = `${data.response || ""} ${data.message || ""}`.toLowerCase();
  if (/quota|rate.?limit|too many|daily limit|monthly limit/.test(response)) {
    const delay = /month/.test(response)
      ? 31 * 86_400_000
      : /daily|quota/.test(response)
        ? 86_400_000
        : 300_000;
    return new MailDeliveryError("quota", delay);
  }
  if (code >= 500 && code <= 599) return new MailDeliveryError("permanent");
  return new MailDeliveryError(
    "transient",
    300_000,
    !(code >= 400 && code <= 499),
  );
}

export function createMailDelivery(env: NodeJS.ProcessEnv = process.env): {
  deliver: Delivery;
  close: () => void;
} {
  const transport = nodemailer.createTransport(smtpConfiguration(env));
  return {
    deliver: async (mail) => {
      try {
        await transport.sendMail({
          from: env.MAIL_FROM || "Rewire <contributions@rewire.it>",
          replyTo: env.MAIL_REPLY_TO || "tim@rewire.it",
          to: mail.recipient,
          subject: mail.subject,
          text: mail.body,
          messageId: mail.messageId,
          date: mail.date,
          headers: { "Resend-Idempotency-Key": mail.idempotencyKey },
          disableFileAccess: true,
          disableUrlAccess: true,
        });
      } catch (error) {
        throw classifySmtpError(error);
      }
    },
    close: () => transport.close(),
  };
}
