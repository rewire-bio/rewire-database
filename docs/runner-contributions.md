# Private runner contributions

The Python `rewirebench.submit` client uses the existing verified-email contribution service. Running or exporting a benchmark never uploads it. Calling `submit` is an explicit submission for curator review, not publication or independent verification.

Production submissions and verification email delivery remain disabled. This document describes the contract implemented and tested locally; enabling production requires the separately approved email and hosting checks.

## Authentication and transport

Sign in with an email link on `/contribute/`. When contributions are enabled and the email has been verified, **Copy library access token** copies a fresh, short-lived Firebase ID token. The library accepts that token explicitly; it never requests an email password or stores credentials. Keep tokens out of scripts, notebooks, logs, shell arguments and exported bundles. Expired tokens require a fresh verified sign-in; the SDK does not use refresh tokens.

Submit one contribution with:

- `POST https://benchmarks.rewire.it/api/trpc/submission.create`
- `Authorization: Bearer <Firebase ID token>`
- `Content-Type: application/json`
- Body: `{ "contribution": { ... }, "idempotencyKey": "<stable request UUID>" }` (unwrapped JSON, no `json` or `input` wrapper).
- Response: `{ "result": { "data": { "id": "...", "status": "submitted" } } }`.

`contribution` includes `type: "result"`, a title, summary, public evidence URL(s), explicit credit preference and `details`. The details require string fields `model`, `benchmark`, `protocol`, `metric`, `value`, `source_locator`. A sanitized runner bundle is stored under `details.rewire_bundle`. Evidence links are stored and are not fetched by the service. Private datasets do not need to be uploaded, but public evidence must support the submitted claim; do not substitute a generic repository URL for absent result evidence.

The bundle has a strict allowlist in `services/omics/src/sdk-submission.ts`: protocol/data identifiers, summary numeric metrics (at least one finite value, at most six nesting levels), positive reconciled coverage, declared model name/training overlap, hash/revision provenance and explicit unreviewed status. Sequences, weights, row predictions, embeddings, paths, tokens and contributor email are not bundle fields. Subset and incomplete runs retain their scope. The full details object is limited to 24,000 UTF-8 bytes, with a 64 KiB request ceiling. Larger per-assay evidence must be linked from an intentionally published external artifact, not silently truncated into a misleading aggregate.

Retry uncertain requests with the same payload and idempotency key. Changed content with the same key returns a conflict. Do not silently retry with new keys. The server deduplicates and rate limits submissions, and obtains ownership/email from the verified identity rather than client fields.

Read status using authenticated `GET /api/trpc/submission.get?input={"id":"..."}` with URL-encoded JSON. Only the owner or a curator can access private records. Revisions use the existing submission update flow and reset review where applicable. Acceptance remains separate from release publication; source checking never becomes independent reproduction because the SDK submitted a bundle.

Expected errors: 401 for missing/expired/unverified identity, 400 for invalid evidence or bundle, 409 for idempotency conflicts, 413 for oversized requests, and 503 while production contributions are disabled. Tokens, bundle contents and server diagnostics must not be printed in user-facing retry errors.
