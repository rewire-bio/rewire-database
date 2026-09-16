# Hosting decision: Firestore and a small TypeScript service

Pricing checked 16 September 2026 against [Firebase pricing](https://firebase.google.com/pricing) and [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

Keep the existing static site/CDN. Public catalogue reading does not use Firestore, so traffic to database pages does not multiply document reads. Versioned downloads use existing site storage. Firestore is for contribution state and a release mirror used by the publication guard.

Firestore Standard currently includes 1 GiB storage, 50,000 document reads/day, 20,000 writes/day and 20,000 deletes/day in its no-cost allowance. A release with roughly 1,200 records consumes roughly that many record writes, plus manifest metadata; monthly releases are modest at this scale. This is a usage estimate, not a guaranteed zero-cost bill. Retaining many releases, backups, egress and abuse can add cost.

Firebase Functions requires Blaze (billing enabled), even when usage fits its no-cost allowance. The implementation uses one HTTP function in europe-west2 with minInstances 0 and maxInstances 2. An instance limit is not a monetary cap. Build artifacts, networking and a production contribution-email provider have separate charges/quotas. Firebase authentication email quotas also need checking for the selected project before launch.

Recommended activation sequence:

1. Select the Firebase project, region and owner-approved billing budget. Do not provision automatically from a site build.
2. Enable email-link authentication, authorised domains, Firestore and the single contribution function. Keep browser Firestore access denied.
3. Configure CORS, authenticated service identities, secret storage, operational quotas and budget alerts. Configure private-data backup/retention and rate-limit TTL.
4. Select transactional SMTP delivery for contribution status messages; do not add marketing email. Run an authorised real inbox test before announcing submissions.
5. Import the checked release, configure frontend environment values, run the browser acceptance flow and only then enable submissions publicly.

The application uses the useful parts of a T3-style stack (Next.js, TypeScript, tRPC and schema validation) without scaffolding a second website, adding Prisma/Postgres, or migrating the existing hosting. Bigtable is not selected: this is a small evidence/curation application, not a large distributed wide-column workload.
