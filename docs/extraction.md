# Production baseline extraction

Source: `https://github.com/timini/rewire.it` at `5f7b8ce477cc7afabc36e02bd002222c931623e7`, extracted 2026-09-16 without rewriting source history.

`extraction-manifest.json` records source paths and SHA-256 hashes before routing and configuration changes. Scientific data bytes remain identical; new deployment files have no predecessor.

- Moved `app/benchmarks/*` to `app/*`; routes, canonical URLs, sitemap and robots use `benchmarks.rewire.it`.
- Preserved the archived MFASS v1 overview at `#mfass-v1`, MFASS v2 and all 100 legacy paper pages.
- Copied small header/footer branding independently. Blog links use document navigation; project branding targets `rewire-bio`.
- Retained scientific data and source URLs verbatim. GitHub transfers preserve historical repository URL redirects.
- Excluded blog pages, stale exported article HTML, article assets, editorial tooling, Terraform and Google deployment workflows.
- Removed analytics from this baseline; contribution routes must stay analytics-free when reviewed later.
- Independent package manifest, lockfile, checks and gated Cloudflare workflow prevent dependency on another checkout or public PR previews.

Unpublished omics features and private contributor services belong on a separate review branch. Restore this baseline from a clean checkout using `npm ci` and `npm run build`.

## Local validation (2026-09-16)

Fresh `npm ci` succeeded. All 12 benchmark catalogue/literature/search tests passed; lint, TypeScript checking, production build and extraction/export checks passed. The build generates 117 static pages, including explicit static icons. Cloudflare `_headers` supplies the MIME type for extensionless generated icons.

Wrangler local checks returned HTTP 200 for the overview, literature query route, a paper detail, MFASS v2, both historical downloads, sitemap and icons. Unknown routes and the unpublished `/database/` and `/contribute/` paths returned HTTP 404. No live deployment was performed during extraction.

## Hosting revision

After extraction, the owner chose Firebase for the database website and API together, retaining Google DNS. The original Wrangler checks above are historical evidence. Current configuration and checks use Firebase Hosting; see [deployment instructions](hosting/firebase.md). Source and release hashes are unchanged.
