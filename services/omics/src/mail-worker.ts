import { pathToFileURL } from "node:url";
import { firebase } from "./firebase.js";
import { drainOutbox } from "./outbox.js";
import { createMailDelivery } from "./mail-transport.js";

/** Invoked by the authenticated scheduler; importing this module never sends mail. */
export async function runMailWorker() {
  const transport = createMailDelivery();
  try {
    // Bound each invocation to two messages within the 180-second function timeout.
    const result = await drainOutbox(firebase().db, transport.deliver, 2, {
      provider: process.env.MAIL_PROVIDER === "gmail" ? "gmail" : "resend",
    });
    const log = result.failed > 0 ? console.warn : console.log;
    log(JSON.stringify({ event: "contribution_mail_drain", ...result }));
    return result;
  } finally {
    transport.close();
  }
}

async function main() {
  try {
    await runMailWorker();
  } catch {
    console.error(
      "Contribution mail worker failed; check configuration and redacted queue status",
    );
    process.exitCode = 1;
  } finally {
    await firebase().db.terminate();
  }
}

// Firebase's emulator loads the ESM graph with require(). Keep its import graph
// free of top-level await, even when this CLI-only branch would not execute.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(() => {
    console.error("Contribution mail worker cleanup failed");
    process.exitCode = 1;
  });
}
