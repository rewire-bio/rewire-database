import { onRequest } from "firebase-functions/v2/https";
import { deployedContributionHttpHandler } from "./http-handler.js";
// Deployment is deliberately separate from development: Firebase Functions requires billing.
export const contributions = onRequest(
  {
    region: "europe-west2",
    serviceAccount: "rewire-catalogue-runtime@rewire-it.iam.gserviceaccount.com",
    invoker: "public",
    minInstances: 0,
    maxInstances: 2,
    memory: "256MiB",
    cors: ["https://benchmarks.rewire.it"],
    timeoutSeconds: 30,
  },
  deployedContributionHttpHandler,
);
