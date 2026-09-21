# Activate SDK submissions

This change prepares live intake; it does not certify that production authentication,
email, IAM or backups have been configured. Keep both intake flags false until the
checks below pass. Scientific publication still requires a reviewed dataset release.

## Prerequisites before merging and deploying

The new scheduled function is declared even when `OMICS_MAIL_ENABLED=false`.
Provision its service account and secret **before merging**: main deploys the whole
Functions codebase. The mail flag stops delivery; it is not an infrastructure flag.

1. Reauthenticate Google Cloud as the existing operator and inspect project
   `rewire-it`. Record the current Function revision, Hosting release and catalogue
   release. Do not replace existing infrastructure or email DNS records.
2. Register the free Resend account, verify `notify.rewire.it`, and disable open
   and click tracking. Add only the provider's required DNS records. Use sender
   `Rewire <contributions@notify.rewire.it>` and Reply-To `tim@rewire.it`.
   Create a domain-restricted sending credential and store an enabled version as
   Secret Manager secret `SMTP_PASSWORD`; never put it in GitHub variables or Git.
3. Create `rewire-mail-runtime@rewire-it.iam.gserviceaccount.com`. Grant only
   Firestore data access needed by the queue and access to that single secret.
   Allow the existing deployment identity to act as this service account. Verify
   Scheduler service identity/invocation permissions; do not grant public invocation
   to `contributionMail`. The catalogue/API identity must not receive the mail secret.
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
does not change already exported HTML. Firebase binds `SMTP_PASSWORD` only to the
mail function. Resend free-tier quota pauses retain queued messages. Existing
Firebase usage, Scheduler, TTL and Secret Manager can incur usage charges; the
free email plan is not a cloud spending cap.

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
- Submit the remaining four audited bundles with the same retry discipline. Link
  their IDs privately to database PR #24 and its proposed evaluation IDs. Curator
  notes must prevent those same evaluations being imported a second time. Leave
  all five pending review; this activation does not merge scientific results.

## Rollback

Set both contribution flags false and redeploy the Function and website. If mail
is faulty, set `OMICS_MAIL_ENABLED=false` and redeploy the mail function too. Keep
the secret and service identity provisioned so the codebase can deploy. Preserve
all private submissions, revisions, idempotency entries and queues. Restore a
compatible application revision and keep public catalogue reads available.

The existing SDK contract is unchanged: dry runs are offline; real requests use a
short-lived verified-email token; successful requests return a private submission
ID with `publication_status=pending_review`. No run or export submits automatically.
