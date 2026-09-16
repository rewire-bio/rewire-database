import { onRequest } from "firebase-functions/v2/https";
import { contributionHttpHandler } from "./http-handler.js";
// Deployment is deliberately separate from development: Firebase Functions requires billing.
export const contributions = onRequest(
  {
    region: "europe-west2",
    maxInstances: 2,
    memory: "256MiB",
    cors: ["https://benchmarks.rewire.it"],
    timeoutSeconds: 30,
  },
  contributionHttpHandler,
);
