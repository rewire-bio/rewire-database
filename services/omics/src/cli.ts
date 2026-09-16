import { createTRPCClient, httpLink } from "@trpc/client";
import type { AppRouter } from "./router.js";
import { statuses } from "./store.js";
const token = process.env.OMICS_ID_TOKEN;
if (!token)
  throw new Error(
    "Set OMICS_ID_TOKEN to a Firebase ID token with curator:true; do not pass tokens in command arguments.",
  );
const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: process.env.OMICS_TRPC_URL || "http://localhost:8787/trpc",
      headers: { authorization: `Bearer ${token}` },
    }),
  ],
});
const [command, id, ...args] = process.argv.slice(2);
if (command === "list")
  console.log(
    JSON.stringify(
      await client.curator.list.query(
        id ? { status: id as (typeof statuses)[number] } : {},
      ),
      null,
      2,
    ),
  );
else if (command === "proposal" && id)
  console.log(
    JSON.stringify(await client.curator.proposal.query({ id }), null, 2),
  );
else if (command === "transition" && id && args.length >= 2) {
  const [status, note, releaseId, ...publishedIds] = args;
  console.log(
    JSON.stringify(
      await client.curator.transition.mutate({
        id,
        status: status as (typeof statuses)[number],
        note,
        releaseId,
        publishedIds,
      }),
      null,
      2,
    ),
  );
} else
  throw new Error(
    'Usage: curator list [status] | proposal ID | transition ID STATUS "review note" [RELEASE_ID RECORD_ID ...]',
  );
