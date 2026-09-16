import nodemailer from "nodemailer";
import { firebase } from "./firebase.js";
import { drainOutbox } from "./outbox.js";
if (!process.env.SMTP_HOST)
  throw new Error(
    "SMTP_HOST must be configured explicitly; no emails are sent by default.",
  );
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  requireTLS: process.env.NODE_ENV === "production",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
  connectionTimeout: 15_000,
  socketTimeout: 30_000,
});
console.log(
  await drainOutbox(firebase().db, (mail) =>
    transport.sendMail({
      from: process.env.MAIL_FROM || "Rewire <contributions@rewire.it>",
      to: mail.recipient,
      subject: mail.subject,
      text: mail.body,
      messageId: mail.messageId,
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
  ),
);
await firebase().db.terminate();
