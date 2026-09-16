import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "./router.js";
import { context } from "./auth.js";
import { requestTooLarge, MAX_REQUEST_BYTES } from "./request-limits.js";

type Request = IncomingMessage & {
  rawBody?: Buffer;
  body?: unknown;
};

// A disabled form alone cannot prevent direct API calls. Production must opt in.
export async function deployedContributionHttpHandler(req: Request, res: ServerResponse) {
  if (process.env.OMICS_CONTRIBUTIONS_ENABLED !== "true") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "Contributions are not enabled." }));
    return;
  }
  await contributionHttpHandler(req, res);
}

// Hosting forwards the original path. Retain /trpc for direct service callers.
export async function contributionHttpHandler(
  req: Request,
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  const pathname = (req.url || "").split("?", 1)[0];
  const path = /^\/(?:api\/)?trpc\/([^/]+)$/.exec(pathname)?.[1];
  if (!path) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  if (requestTooLarge(req)) {
    res.statusCode = 413;
    res.end("Request too large");
    return;
  }
  await nodeHTTPRequestHandler({
    req,
    res,
    path,
    router: appRouter,
    createContext: () => context(req.headers.authorization),
    maxBodySize: MAX_REQUEST_BYTES,
  });
}
