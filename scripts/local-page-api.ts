import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { localRecordPage } from "../lib/record-page-local";
import { recordPageKinds, type RecordPageKind } from "../services/omics/src/record-pages";

// Development stand-in for catalogue.page: the same tRPC response shape, built
// from the hydrated local release by the importer's page builder. It serves no
// other procedure and is never deployed.
const lock = JSON.parse(fs.readFileSync("benchmark-data.lock.json", "utf8"));
export const LOCAL_PAGE_API_PORT = 8790;

export function localPageResponse(url: URL): { status: number; body: unknown } {
  if (url.pathname !== "/api/trpc/catalogue.page") return { status: 404, body: { error: { message: "Not found" } } };
  let input: { release_id?: unknown; kind?: unknown; id?: unknown };
  try { input = JSON.parse(url.searchParams.get("input") || ""); }
  catch { return { status: 400, body: { error: { message: "Invalid input" } } }; }
  if (input.release_id !== lock.release_id)
    return { status: 412, body: { error: { message: "Pinned catalogue release is not published." } } };
  if (!(recordPageKinds as readonly unknown[]).includes(input.kind) || typeof input.id !== "string")
    return { status: 400, body: { error: { message: "Invalid input" } } };
  return { status: 200, body: { result: { data: localRecordPage(input.kind as RecordPageKind, input.id) } } };
}

export function startLocalPageApi(port: number, respond = localPageResponse): Promise<http.Server> {
  const server = http.createServer((request, response) => {
    const { status, body } = request.method === "GET"
      ? respond(new URL(request.url || "/", "http://127.0.0.1"))
      : { status: 405, body: { error: { message: "Method not allowed" } } };
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

// tsx scripts/local-page-api.ts [-- command args...]: serve, and optionally run
// a command (for example next dev) with REWIRE_CATALOGUE_API pointing here.
async function main() {
  const port = Number(process.env.LOCAL_PAGE_API_PORT || LOCAL_PAGE_API_PORT);
  const server = await startLocalPageApi(port);
  const api = `http://127.0.0.1:${port}`;
  console.log(`Local catalogue.page API for ${lock.release_id} on ${api}`);
  const separator = process.argv.indexOf("--");
  const command = separator >= 0 ? process.argv.slice(separator + 1) : [];
  if (command.length) {
    // A local production preview serves this checkout's prepared data as an unpublished build.
    const child = spawn(command[0], command.slice(1), { stdio: "inherit", env: {
      ...process.env, REWIRE_CATALOGUE_API: api,
      REWIRE_DATA_ROOT: process.env.REWIRE_DATA_ROOT || process.cwd(),
      REWIRE_FRONTEND_VERSION: process.env.REWIRE_FRONTEND_VERSION || "0".repeat(40),
      REWIRE_DATA_RELEASE: lock.release_id,
    } });
    child.once("exit", (code) => { server.close(); process.exitCode = code ?? 1; });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => child.kill(signal));
  }
}
// tsx runs this checkout's scripts as CommonJS.
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
