# Submission recovery verification

Verified 23 September 2026 for issue #34. Intake remains enabled and notification email remains paused. No production settings, submissions, curator decisions or catalogue records were changed by this verification.

## Live workflow

Authenticated read-only calls to `curator.list` and `submission.get` found all ten existing SDK submissions in the published state, with verified ownership and curator access. The exact retained bundles and pinned evidence URLs matched. Their reviewed publication links were established after PR #24 deployed release `2026-09-22-f58a0f1d267f`; this pass did not submit or publish anything again. Existing Firebase session refresh worked without a new sign-in.

Production deployment `35791831212` completed successfully from merge `1894c0e82f537b4f9a2639c65ac7abf2979e6d38`. Its API and website probes checked the same 21,974-record release and enabled contribution authentication gates. Hosting version is `b69a29991d28e6bd`; the captured rollback pair is Hosting `b2f5aadfe1fb2025` and catalogue `2026-09-20-b2596bdf5206`.

Repository configuration was read back as intake `true`, frontend intake `true`, notifications `false`. Queued messages are not delivered messages. Gmail Workspace delegation and a received-message test remain prerequisites for optional notification activation. No Resend account, mailbox change or email send was performed.

## Executed recovery drill

The new emulator test creates a synthetic partial SDK contribution through the deployed HTTP handler, checks curator review, pauses intake locally, takes a private backup and simulates private-collection loss in an isolated `demo-` project. It restores to the empty private collections while retaining the synthetic Auth accounts and public catalogue. After re-enabling local intake, it verifies:

- The owner sees identical content, review notes, revisions and the partial-run label.
- A different verified user cannot read it; the curator can still review it.
- Retrying the exact SDK request with its original key returns the same identity and review state, without another contribution or notification.
- Reusing that key for changed content fails.
- Disabled intake returns `503` with `no-store`, blocks private mutations and leaves public catalogue reads available.
- Pending mail remains pending with zero send attempts; no transport is invoked.
- The public catalogue remains unchanged and contains no private submission identity.

The backup files are created outside Git in a temporary `0700` directory with `0600` file modes, then removed after assertions. The existing separate roundtrip test covers all five private collections, orphan revisions, typed Firestore values, corruption and refusal to overwrite an occupied destination. New permission checks reject readable-by-others input/checksum files and directories, including resolved input paths inside Git. New backups also reject document-reference fields, whose origin database the Firestore SDK can discard. No current submission field requires document references; legacy reference snapshots need a separate provenance review.

## Evidence and limits

| Requirement | Evidence | Environment |
|---|---|---|
| Existing SDK receipt, ownership, curator and released association | Ten exact retained bundles reconciled with authenticated owner/curator reads; prior deployment and publication receipts | Production read-only |
| Invalid, expired, revoked and disabled identities; single-use sign-in links | `services/omics/test/emulator.test.ts` | Auth emulator; no real user revoked |
| Duplicate retries, changed payload, partial/malformed bundles | Recovery drill, raw SDK HTTP test, `sdk-submission.test.ts`, contract parity fixtures | Local emulators and unit tests |
| Private collection and export isolation | Recovery drill, `private-backup.test.ts`, catalogue privacy and HTTP tests | Local emulators |
| Backup integrity and recovery after loss | Recovery drill plus typed snapshot roundtrip | Synthetic data only |
| Notification retries, quotas and ambiguous delivery | `gmail-outbox.test.ts`, transport and outbox tests | Mock transport; no email sent |

The [redacted receipt](receipts/submission-recovery-2026-09-23.json) contains counts and public deployment identifiers only. It is automated verification, not a new human scientific review.

This is not a production restore or a point-in-time live backup. No encrypted off-device backup schedule, cross-project Auth recovery or Gmail inbox delivery was tested. Firebase Auth accounts, UIDs/custom claims, IAM, secrets and scheduler configuration are outside the portable Firestore snapshot. The synthetic drill retains its existing Auth accounts; a different-project recovery must separately preserve user identity before reopening intake.

## Recovery procedure

Use the commands in [private contribution operations](contribution-operations.md). Before any production recovery, identify the incident and exact previous deployment, arrange a reviewed maintenance window, pause intake and curator writes, keep mail paused, and wait for in-flight requests. The portable backup spans queries and cannot claim consistency while writes continue.

Restore only to an empty isolated destination. Validate checksum, private paths, collection/revision counts, Auth identity mapping, idempotency behaviour, public catalogue and mail states before switching traffic. A partial restore is not atomic: use a new empty destination rather than overwrite partial data. Keep the old database recoverable. Do not send the restored outbox until accepted/ambiguous provider deliveries have been reconciled.

For application rollback without data loss, retain private collections and stable SDK retry keys. Revert the reviewed application configuration; do not delete or recreate submissions. Backend and frontend intake flags must agree after deployment. Notifications are controlled separately and stay off until their independent delivery gate passes. Reopening intake requires verified API ownership/tracking, not email delivery.
