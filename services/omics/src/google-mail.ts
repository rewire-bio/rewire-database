import { applicationDefault } from "firebase-admin/app";
import nodemailer from "nodemailer";
import { MailDeliveryError, type Delivery } from "./outbox.js";

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const TIMEOUT_MS = 15_000;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function googleMailConfiguration(env: NodeJS.ProcessEnv) {
  const signer = env.GMAIL_SERVICE_ACCOUNT || "";
  const sender = env.GMAIL_SENDER || "";
  const replyTo = env.MAIL_REPLY_TO || sender;
  if (!/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(signer))
    throw new Error(
      "GMAIL_SERVICE_ACCOUNT must identify the delegated service account",
    );
  if (!EMAIL.test(sender) || !EMAIL.test(replyTo))
    throw new Error(
      "GMAIL_SENDER and MAIL_REPLY_TO must be single email addresses",
    );
  return { signer, sender, replyTo };
}

interface Dependencies {
  fetch?: typeof fetch;
  accessToken?: () => Promise<string>;
  now?: () => number;
}

/** Keyless Workspace delegation. No mailbox read scope or private key is used.
 * Sources: developers.google.com/identity/protocols/oauth2/service-account
 * docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/signJwt
 * developers.google.com/workspace/gmail/api/guides/sending
 * Gmail has no provider idempotency key: an uncertain send must be reconciled,
 * never blindly retried. Message-ID is only a reconciliation aid.
 */
export function createGoogleMailDelivery(
  env: NodeJS.ProcessEnv,
  dependencies: Dependencies = {},
): { deliver: Delivery; preflight: () => Promise<void>; close: () => void } {
  const config = googleMailConfiguration(env);
  const request = dependencies.fetch || fetch;
  const now = dependencies.now || Date.now;
  const adcToken =
    dependencies.accessToken ||
    (async () => (await applicationDefault().getAccessToken()).access_token);
  const mime = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
  });
  let cached: { token: string; expires: number } | undefined;

  async function post(url: string, init: RequestInit, sending = false) {
    try {
      const response = await request(url, {
        ...init,
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        // Only inspect provider responses in memory; they can contain private data.
        const body = (await response.json().catch(() => ({}))) as {
          error?: { errors?: { reason?: string }[] };
        };
        const reasons =
          typeof body.error === "object"
            ? body.error?.errors?.map((entry) => entry.reason) || []
            : [];
        const quota =
          response.status === 429 ||
          reasons.some((reason) =>
            [
              "rateLimitExceeded",
              "userRateLimitExceeded",
              "dailyLimitExceeded",
              "quotaExceeded",
            ].includes(reason || ""),
          );
        if (quota) throw new MailDeliveryError("quota", 86_400_000);
        if (response.status >= 400 && response.status < 500)
          throw new MailDeliveryError("permanent");
        throw new MailDeliveryError("transient", 300_000, sending);
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      throw new MailDeliveryError("transient", 300_000, sending);
    }
  }

  async function delegatedToken() {
    if (cached && cached.expires > now() + 60_000) return cached.token;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const accessToken = await Promise.race([
        adcToken(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Credential timeout")),
            TIMEOUT_MS,
          );
        }),
      ]);
      const issued = Math.floor(now() / 1000);
      const signed = await post(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.signer}:signJwt`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payload: JSON.stringify({
              iss: config.signer,
              sub: config.sender,
              scope: SCOPE,
              aud: TOKEN_URL,
              iat: issued,
              exp: issued + 3600,
            }),
          }),
        },
      );
      if (typeof signed.signedJwt !== "string" || !signed.signedJwt)
        throw new MailDeliveryError("transient");
      const token = await post(TOKEN_URL, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: signed.signedJwt,
        }).toString(),
      });
      if (
        typeof token.access_token !== "string" ||
        !token.access_token ||
        typeof token.expires_in !== "number" ||
        !Number.isFinite(token.expires_in) ||
        token.expires_in <= 60
      )
        throw new MailDeliveryError("transient");
      cached = {
        token: token.access_token,
        expires: now() + Math.min(token.expires_in, 3600) * 1000,
      };
      return cached.token;
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      throw new MailDeliveryError("transient");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    preflight: async () => {
      await delegatedToken();
    },
    deliver: async (mail) => {
      if (
        !EMAIL.test(mail.recipient) ||
        /[\r\n]/.test(mail.subject) ||
        !/^<[^<>\s]+@[^<>\s]+>$/.test(mail.messageId) ||
        !Number.isFinite(mail.date.getTime())
      )
        throw new MailDeliveryError("permanent");
      let raw: string;
      try {
        const message = await mime.sendMail({
          from: { name: "Rewire", address: config.sender },
          replyTo: config.replyTo,
          to: mail.recipient,
          subject: mail.subject,
          text: mail.body,
          messageId: mail.messageId,
          date: mail.date,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        if (!Buffer.isBuffer(message.message))
          throw new Error("MIME output must be buffered");
        raw = message.message.toString("base64url");
      } catch {
        throw new MailDeliveryError("permanent");
      }
      const token = await delegatedToken();
      const response = await post(
        SEND_URL,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        },
        true,
      );
      if (typeof response.id !== "string" || !response.id)
        throw new MailDeliveryError("transient", 300_000, true);
      return { id: response.id };
    },
    close: () => {
      cached = undefined;
      mime.close();
    },
  };
}
