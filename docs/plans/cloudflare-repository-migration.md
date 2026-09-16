# Separate rewire into three repositories and move hosting to Cloudflare

Status: implementation started 2026-09-16. Model/benchmark profile work is deferred; see `model-benchmark-profiles.md`.

## Revised hosting decision, 16 September 2026

This decision supersedes the Cloudflare database and DNS portions of the original plan below. The three-repository split is unchanged.

- Google Cloud DNS remains authoritative; no nameserver change or Gandi access is needed.
- The benchmark website, API, Firebase Auth and Firestore target one Firebase project, with all application and deployment code in rewire-database.
- Firebase Hosting serves benchmarks.rewire.it and forwards /api/trpc requests to the project's Firebase Function after backend activation is approved.
- The blog retains its separate Cloudflare target. Its apex-versus-www decision remains pending; do not change the live blog hostname implicitly.
- Production submissions, unpublished catalogue features and billing activation remain excluded from this migration. No new paid infrastructure is provisioned.
- Do not retire the GCP project: only dedicated obsolete blog-hosting resources may eventually be retired after the retention window.

The initial Cloudflare database upload is unused and must not be activated. Database CI now deploys the published baseline to Firebase site `rewire-it`; its first keyless main-branch deployment passed. Backend and Cloudflare deployment remain disabled. The `benchmarks.rewire.it` custom-domain certificate is pending. See [Firebase rollout and deployment](../hosting/firebase.md) for the configuration and release record. The remainder records the original agreed migration for history.

## Agreed ownership

| Repository | Responsibility | Visibility |
| --- | --- | --- |
| rewire-bio/rewire-benchmarks | Runners, adapters, protocols, reproducible artifacts | Public |
| rewire-bio/rewire-database | Benchmark website, records, releases, contribution service | Private |
| rewire-bio/rewire.it | Blog, editorial tools, article assets | Private |

Transfer existing blog and runner repositories with history, issues and pull requests. Extract the database with a checksummed manifest and source revision. Preserve personal authorship. Each repository has independent dependencies, lockfiles, checks and deployment configuration; copy small branding components.

## Preservation and publication boundary

Snapshot Git history, uncommitted database work and ignored generated release artifacts. Exclude credentials, emulator state and dependencies from extraction. Preserve unrelated scratch/workbench/local MFASS data in place. Published benchmark pages form database main; the new database, unified explorer and contribution service remain on a separate review branch. Migration does not publish unfinished features.

Preserve historical scientific records, IDs, values, releases and checksums. Update branding through presentation code. Benchmark execution never automatically publishes results.

## Hosting and interfaces

Keep static Next.js exports. Deploy independent Cloudflare Workers Static Assets sites at https://rewire.it and https://benchmarks.rewire.it. Database routes drop `/benchmarks`; its root becomes the benchmark overview. Preserve `#mfass-v1`. Each site owns Wrangler and GitHub Actions configuration and credentials. Private PR checks do not automatically expose previews.

Permanently redirect old benchmark routes, `/benchmark-literature/*` downloads and `/omics/*` releases. Preserve filenames, queries, trailing-slash semantics and browser fragment inheritance. Update navigation, canonical URLs, feeds and sitemaps. Use document navigation between origins.

Firebase and tRPC remain owned by the database. Update callbacks, email links, CORS, authorised domains and analytics exclusions for `/contribute`. Production submissions stay disabled. Explicitly exclude retired HTML from Cloudflare export and serve genuine 404s.

## Rollout and rollback

1. Complete snapshots, extraction, independent builds and local checks.
2. Verify organisation, Cloudflare, Google DNS and registrar access.
3. Export the full live DNS zone, preserving MX, SPF, DKIM, DMARC and verification records. Handle DNSSEC before nameserver changes.
4. Prepare Cloudflare DNS retaining the GCP web origin initially.
5. Freeze production and disable GCP's Terraform-applying deployment workflow before transfer.
6. Transfer repositories and verify new deployment credentials.
7. Deploy and verify database first; then blog and compatibility redirects.
8. Retain GCP for seven days; restore the old DNS target for overall rollback. Keep independent previous Cloudflare deployments.
9. Check immediately, after 24 hours and before retirement. Retire only dedicated blog resources and obsolete credentials; preserve email, unrelated services, backups and Terraform state. Never run blanket Terraform destroy.

## Acceptance

Correct ownership/visibility; independent clean builds; intact scientific records/releases/MFASS and unpublished work; working old URLs/downloads/fragments/images/feed; genuine unknown and retired 404s; contribution emulator tests and private-data exclusion; unchanged mail/verification DNS; immediate/24-hour/pre-retirement checks.

No paid infrastructure, new benchmark runs, production submission activation or profile expansion. No scientific record schema or public API change.

## Progress

- [x] Save both plans.
- [ ] Recovery snapshots and checksum verification.
- [ ] Independent blog and database production builds.
- [ ] Unpublished database review branch and contribution checks.
- [ ] Organisation/account access verified.
- [ ] Live DNS export and migration readiness.
- [ ] Transfers and independent CI configured.
- [ ] Cloudflare cutover and immediate verification.
- [ ] 24-hour checks.
- [ ] Seven-day checks and selective GCP retirement.

Implementation evidence and blockers will be recorded here without credentials.
