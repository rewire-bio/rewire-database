# Private contribution operations

Contributions are private review items. Acceptance does not publish a scientific result: the curator must prepare a reviewed release and associate the released record IDs with the submission before marking it published. Contributions must never be included in catalogue downloads, release fixtures, Git commits, CI artifacts or analytics.

Current status: intake enabled, contribution notifications paused. The [23 September recovery receipt](submission-recovery-2026-09-23.md) distinguishes live read-only checks from synthetic emulator recovery.

## Access and retention

- The API accesses `privateSubmissions`, its `revisions` subcollections, `privateIdempotency`, `privateRateLimits` and `privateOutbox`. The mail worker also uses `privateMailQuota`. Browser clients cannot read these collections directly.
- Only verified owners and authorised curators may access submissions through the service. Grant curator status to Tim's verified Firebase UID through a reviewed administrator operation; never infer curator access from a submitted email field.
- Keep unresolved submissions and revisions until a review decision is resolved. Review resolved submissions for removal 365 days after resolution. Preserve public scientific records and their provenance; remove private contact information rather than rewriting published evidence.
- After successful delivery, the worker clears recipient and body. Keep compact sent delivery metadata for 90 days, then remove it through a reviewed maintenance operation. Failed and pending messages still contain private data; investigate and resolve them before applying retention. Do not delete unanswered submissions or failed mail automatically.
- Rate limits use Firestore TTL on `privateRateLimits.expiresAt`. TTL is asynchronous. Authentication, rate enforcement and queue delivery must not rely on prompt deletion.
- No automated deletion policy is activated by this document. Record the reviewed IDs, reason, operator and date before any cleanup, without copying message bodies or emails into the operations log. Retire backups when their retention window expires so removed private data does not persist indefinitely.

## Portable private backup

The CLI takes an explicit project and copies only the private allowlist, including submission revisions whose parent document is missing. Public catalogue collections are excluded. Firestore timestamps retain nanosecond precision. New backups reject document-reference fields because the Firestore SDK can discard their origin database during decoding. Current private submission data uses JSON and timestamps, not references. Legacy snapshot references decode as destination-local paths and require a separate provenance review before restoration. Checksums detect accidental modification; they are not signatures or encryption.

Use an administrator workstation and an encrypted local volume outside every Git checkout. Require restricted OS access and a private encrypted off-device copy. The CLI requires a private `0700` directory, creates the snapshot and checksum with mode `0600`, refuses existing output files and refuses paths inside Git. Restore also checks the resolved input locations and file permissions. It does **not** configure encryption or a backup destination. Do not use ordinary CI artifacts, a shared Downloads directory or a public bucket.

For a consistent production snapshot, first disable new intake, pause curator writes and pause scheduled mail delivery. Wait for any in-flight request and mail lease to finish. Firestore reads span multiple queries; this portable tool is not a point-in-time backup while writes continue. A production activation must include a recorded successful recovery drill and a secured snapshot location.

Create the `rewire-private` directory with mode `0700` first. From `services/omics`, using application-default credentials with read access:

```sh
npx tsx src/private-backup.ts backup \
  --project YOUR_FIREBASE_PROJECT \
  --file /Volumes/YOUR_ENCRYPTED_VOLUME/rewire-private/rewire-private-YYYY-MM-DD.json \
  --writes-paused
```

It prints only the document count and checksum. Keep the `.sha256` file beside the snapshot. Record the count, checksum, source project, capture time and deployment identifiers in the private operations log. Unknown nested collections cause a failure instead of silently losing data. Update and review the allowlist whenever private storage changes.

Firebase Auth accounts, custom claims, secrets, IAM, scheduler configuration and TTL configuration are **not** included. Keep their recovery procedure and credential references separately, without exporting credentials into this snapshot. A recovery in a different project must separately preserve Firebase user UIDs and claims before accepting logins; otherwise submission ownership will not match.

## Restore and recovery drill

Restore defaults to the Firestore emulator. It validates the checksum, document encoding, allowlisted paths and duplicate paths before writing. Every destination private collection must be empty, including orphan subcollections. Existing catalogue records are untouched. All writes use create-only operations, so concurrent records are never overwritten.

With an emulator running on the address below:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  npx tsx src/private-backup.ts restore \
  --project demo-rewire-private-recovery \
  --file /Volumes/YOUR_ENCRYPTED_VOLUME/rewire-private/rewire-private-YYYY-MM-DD.json
```

Check collection and revision counts, timestamp values, submission ownership, idempotency records and pending/failed mail. Keep restored mail dispatch disabled so a drill cannot send receipts. The automated emulator test performs a synthetic roundtrip, including orphan revisions, and checks all values and exclusion of public data:

```sh
npx firebase emulators:exec --project demo-rewire-omics --only firestore \
  'npx tsx --test test/private-backup.test.ts'
```

For a reviewed production recovery, unset `FIRESTORE_EMULATOR_HOST`, use a new empty recovery project with restricted IAM and rules, and add both `--allow-production-restore` and `--writes-paused`. Keep intake and mail off. The tool never deletes the old database. It does not promise an atomic restore across batches: on failure, investigate and use a fresh empty recovery destination instead of trying to overwrite partial data. Do not open intake until user UIDs, claims, rules, configuration and source/destination counts have been verified. Reconcile provider delivery IDs before resuming pending mail, especially after an older snapshot has been restored.

## Delivery checks and rollback

Check scheduled worker invocations, queue counts by state and oldest pending timestamp. Investigate failed messages and quota pauses without logging payloads or authentication tokens. Provider acceptance is not proof of inbox delivery: confirm the initial receipt arrives in the recipient's mailbox. Keep receipts and review messages transactional; do not add tracking or promotional content.

Rollback intake through its persisted deployment setting while retaining private collections. Stop mail dispatch separately if delivery is faulty. Revert to the previous application deployment without deleting submissions. Re-enable only after authenticated ownership and curator checks, preserved idempotent retry behaviour and an API acknowledgement/tracking check have been verified. Reuse an existing contribution and its original stable key; do not create duplicate scientific evidence. Email delivery is a separate optional gate and must not block working intake. Production configuration and actual verification results must be recorded separately; this document alone is not evidence that a live backup, account or mail provider has been configured.

Restore requests are planned before writes and bounded to 300 documents and a conservative 8,000,000-byte estimate, including tagged value encoding and 1,024 bytes of overhead per document. Large permitted contribution fields can exceed Firestore’s request limit even below 300 documents; the byte bound splits these safely. Create-only writes and refusal to overwrite remain in force. A 240-document synthetic emulator roundtrip exercises multiple byte-bounded batches.
