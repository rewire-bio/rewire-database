import { onRequest } from "firebase-functions/v2/https";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "./router.js";
import { context } from "./auth.js";
import { requestTooLarge, MAX_REQUEST_BYTES } from "./request-limits.js";
// Deployment is deliberately separate from development: Firebase Functions requires billing.
export const contributions = onRequest(
  {
    region: "europe-west2",
    maxInstances: 2,
    memory: "256MiB",
    cors: ["https://benchmarks.rewire.it"],
    timeoutSeconds: 30,
  },
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (requestTooLarge(req)) {
      res.status(413).send("Request too large");
      return;
    }
    await nodeHTTPRequestHandler({
      req,
      res,
      path: req.path.replace(/^\/trpc\//, ""),
      router: appRouter,
      createContext: () => context(req.headers.authorization),
      maxBodySize: MAX_REQUEST_BYTES,
    });
  },
);
