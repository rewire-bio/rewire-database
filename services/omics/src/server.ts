import { contributionHttpHandler } from "./http-handler.js";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
const origins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001"
).split(",");
export function createAppServer() {
  return createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      res.writeHead(403);
      res.end("Origin not allowed");
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url === "/health") {
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    void contributionHttpHandler(req, res);
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  createAppServer().listen(Number(process.env.PORT || 8787), "127.0.0.1", () =>
    console.log(
      "Omics contribution service listening on localhost:" +
        (process.env.PORT || 8787),
    ),
  );
}
