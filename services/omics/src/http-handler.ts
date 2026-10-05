import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { appRouter } from "./router.js";
import { context } from "./auth.js";
import { requestTooLarge, MAX_REQUEST_BYTES } from "./request-limits.js";

type Request = IncomingMessage & {
  rawBody?: Buffer;
  body?: unknown;
};

const catalogueProcedures = new Set([
  "catalogue.release",
  "catalogue.list",
  "catalogue.get",
  "catalogue.results",
  "catalogue.compare",
  "catalogue.comparison",
  "catalogue.evidence",
  "catalogue.auditRuns",
  "catalogue.auditRecords",
  "catalogue.auditChecks",
  "catalogue.useCases",
  "catalogue.useCase",
  "catalogue.useCaseEvaluationResults",
  "catalogue.useCaseLinks",
  "catalogue.researchReadiness",
  "catalogue.investigations",
]);
function catalogueRequest(req: Request): boolean {
  if (req.method !== "GET") return false;
  const path = /^\/(?:api\/)?trpc\/([^/]+)$/.exec(
    (req.url || "").split("?", 1)[0],
  )?.[1];
  return !!path && path.split(",").every((p) => catalogueProcedures.has(p));
}
// A disabled form alone cannot prevent direct API calls. Production must opt in.
export async function deployedContributionHttpHandler(
  req: Request,
  res: ServerResponse,
) {
  if (
    !catalogueRequest(req) &&
    process.env.OMICS_CONTRIBUTIONS_ENABLED !== "true"
  ) {
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
    createContext: () =>
      catalogueRequest(req)
        ? Promise.resolve({ user: null })
        : context(req.headers.authorization),
    responseMeta: ({ errors }) => {
      // Public, successful read-only batches may be cached. Private and mixed batches never are.
      if (catalogueRequest(req) && !errors.length)
        return {
          headers: { "Cache-Control": "public, max-age=30, s-maxage=60" },
        };
      return { headers: { "Cache-Control": "no-store" } };
    },
    maxBodySize: MAX_REQUEST_BYTES,
  });
}
