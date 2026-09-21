import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { deployedContributionHttpHandler } from "./http-handler.js";
import { runMailWorker } from "./mail-worker.js";
// Deployment is deliberately separate from development: Firebase Functions requires billing.
export const contributions = onRequest(
  {
    region: "europe-west2",
    serviceAccount: "rewire-catalogue-runtime@rewire-it.iam.gserviceaccount.com",
    invoker: "public",
    minInstances: 0,
    maxInstances: 2,
    memory: "512MiB",
    concurrency: 4,
    cors: ["https://benchmarks.rewire.it"],
    timeoutSeconds: 30,
  },
  deployedContributionHttpHandler,
);

// Scheduler invokes this function using IAM; it is not a public HTTP mail API.
const smtpPassword = defineSecret("SMTP_PASSWORD");
export const contributionMail = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "UTC",
    region: "europe-west2",
    serviceAccount: "rewire-mail-runtime@rewire-it.iam.gserviceaccount.com",
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
    memory: "256MiB",
    timeoutSeconds: 180,
    retryCount: 0,
    secrets: [smtpPassword],
  },
  async () => {
    if (process.env.OMICS_MAIL_ENABLED !== "true") return;
    const outcome = await runMailWorker();
    logger.info("Contribution email delivery", outcome);
  },
);
