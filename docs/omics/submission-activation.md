# Activate SDK submissions

This change prepares live intake; it does not certify that production authentication,
email, IAM or backups have been configured. Keep both intake flags false until the
checks below pass. Scientific publication still requires a reviewed dataset release.

## Prerequisites before merging and deploying

The new scheduled function is declared even when `OMICS_MAIL_ENABLED=false`.
Provision its service account **before merging**: main deploys the whole
Functions codebase. The mail flag stops delivery; it is not an infrastructure flag.

1. Reauthenticate Google Cloud as the existing operator and inspect project
   `rewire-it`. Record the current Function revision, Hosting release and catalogue
   release. Do not replace existing infrastructure or email DNS records.
2. Use the existing Google Workspace mailbox `tim@rewire.it` through the Gmail
   API. No Resend account, sending-domain DNS changes or SMTP password is required.
   Enable Gmail and IAM Credentials APIs in `rewire-it`. Authorise the dedicated
   mail service account's numeric OAuth client ID in Workspace domain-wide
   delegation for **only** `https://www.googleapis.com/auth/gmail.send`.
   Workspace delegation is domain-wide even though this application fixes the
   sender to Tim; the Workspace administrator must review this permission.
3. Use `rewire-mail-runtime@rewire-it.iam.gserviceaccount.com` as both runtime and
   JWT signer. Grant it `iam.serviceAccounts.signJwt` on itself through a custom
   role, plus the existing private-outbox Firestore role. No downloaded keys are
   needed. Keep the catalogue runtime unable to sign as this identity. Allow the
   existing deployment identity to act as it. Scheduler invocation stays private.
   The mailer exchanges a signed assertion for a short-lived `gmail.send` token;
   it cannot read the mailbox. From is `Rewire <tim@rewire.it>` and Reply-To is
   `tim@rewire.it`. Messages contain no tracking.
4. Extend the API runtime from read-only Firestore to the data operations required
   by submission transactions; it also requires `firebaseauth.users.get` for revoked
   token checks. Use a custom IAM role without project administration or Auth writes.
   Firestore server IAM is not collection-level isolation: retain deny-all browser
   rules and the API's verified-owner/curator checks.
5. Enable Firebase email-link sign-in. Authorize `benchmarks.rewire.it` and use
   `https://benchmarks.rewire.it/contribute/` for continuation. Configure project
   email quotas and verify real sign-in delivery. Do not enable emulator trust.
6. Complete the private snapshot and restore drill described in
   [contribution operations](contribution-operations.md). Secure the production
   backup location and record the recovery checks before opening intake.

## Persisted configuration

Repository variables configure the reviewed deployment:

| Variable | Value |
| --- | --- |
| `OMICS_CONTRIBUTIONS_ENABLED` | `false` initially, then `true` after readiness checks |
| `NEXT_PUBLIC_OMICS_CONTRIBUTIONS_ENABLED` | `false` initially, then `true` for the public sign-in page |
| `OMICS_MAIL_ENABLED` | `true` after a controlled delivery test |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `rewire-it` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `rewire-it.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Verified public web-app configuration from Firebase |

The service `.env` is generated from an allowlist during deployment. It contains no
credentials. A typo in an activation flag or mismatched client project fails the
build. Build the frontend with its public settings; changing a runtime variable
does not change already exported HTML. The reviewed service configuration fixes
`MAIL_PROVIDER=gmail`, `GMAIL_SERVICE_ACCOUNT` and `GMAIL_SENDER`; it contains no
credentials. Gmail uses the runtime identity rather than a bound secret. The
legacy empty SMTP secret is unused. Conservative limits of 100 attempts per day
and 3,000 per rolling month also apply; Google Workspace may enforce additional
limits. Quota pauses retain queued messages. Existing Firebase usage, Scheduler
and TTL can incur usage charges; this is not a cloud spending cap.

Gmail does not guarantee duplicate suppression. Stable Message-ID and Date help
manual reconciliation but are not idempotency keys. An uncertain send or a worker
crash after claiming a message is parked for curator review rather than retried.
Definite temporary rejections use bounded backoff; permanent errors are reported.
Check the sender's Sent folder before any manual retry of an uncertain message.

## Acceptance and first submissions

- Run root tests, lint, typecheck, build and export checks; service tests under
  Auth/Firestore emulators; and the released wheel's cross-language integration
  test. The backup roundtrip uses synthetic data in isolated demo projects.
- With intake off, deploy and confirm the catalogue works while submission,
  curator and mixed public/private requests return 503 with `no-store`.
- Verify a real email link at `/contribute/`, its single-use behaviour and session
  refresh. Expired/revoked tokens and other users' submission IDs must be rejected.
- Bootstrap the initial curator only after Tim has verified his account:
  `GCLOUD_PROJECT=rewire-it NODE_ENV=production npx tsx src/grant-curator.ts tim@rewire.it --grant`
  from `services/omics` using operator ADC. Refresh that user's ID token afterward.
- Enable intake and deploy the configured frontend. The read-only live probe now
  expects unauthenticated private requests to return 401; mixed batches retain
  public results but deny private members. Neither probe creates contributions.
- Use the released `rewirebench.submit()` with the first audited bundle and its
  immutable evidence URL. Save the returned submission ID and idempotency key in
  the private operations record. Verify owner tracking, curator visibility and
  actual receipt delivery. Do not put tokens or email bodies in public receipts.
- Submit the remaining queued audited bundles with the same retry discipline. Link
  their IDs privately to database PR #24 and its proposed evaluation IDs. Curator
  notes must prevent those same evaluations being imported a second time. Leave
  all contributions pending review; this activation does not merge scientific results.

## Rollback

Set both contribution flags false and redeploy the Function and website. If mail
is faulty, set `OMICS_MAIL_ENABLED=false` and redeploy the mail function too. Keep
the service identity provisioned so the codebase can deploy. Preserve
all private submissions, revisions, idempotency entries and queues. Restore a
compatible application revision and keep public catalogue reads available.

The existing SDK contract is unchanged: dry runs are offline; real requests use a
short-lived verified-email token; successful requests return a private submission
ID with `publication_status=pending_review`. No run or export submits automatically.

## Google implementation references

- [Firebase email sign-in](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Workspace delegated service-account authentication](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Keyless JWT signing](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/signJwt)
- [Gmail message sending](https://developers.google.com/workspace/gmail/api/guides/sending)

Implementation references reviewed 22 September 2026. Successful unit tests do
not establish Workspace authorisation or inbox delivery; record those separately.
