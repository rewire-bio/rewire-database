# Crawlable model and benchmark indexes

The public database now has two static discovery paths:

- `/benchmarks/` lists every non-excluded record whose canonical kind is `benchmark`.
- `/models/` lists canonical model records alphabetically, with 24 records per page. Further pages use `/models/page/2/`, `/models/page/3/`, and so on. Page 1 exists only at `/models/`; invalid or out-of-range pages return 404.

Counts and pages derive from the reviewed release used by the build. Matching names do not merge identities. Repeated names display record IDs, while evaluated configurations, methods, pipelines, tasks, protocols and evaluators remain separate entities linked through the existing explorer.

Each index includes existing profile summaries, biology-area labels, clean canonical record anchors and a link to the release manifest. Primary navigation and the database homepage link to both indexes. Pagination is ordinary HTML navigation with previous/next and current-page labels. All index pages have self-referencing canonicals and sitemap entries. Query-based filtering stays in the interactive explorer and does not create additional index pages. Existing explorer return context is unchanged.

`/benchmarks/` on **benchmarks.rewire.it** is a new index route. It does not change the main blog's `/benchmarks/` migration redirect to the database homepage.

## Validation

`tests/catalogue-index.test.tsx` checks complete benchmark and paginated model coverage against a committed release, exact entity boundaries, canonical links, stable ordering, excluded records, invalid page numbers and initial navigation HTML. Existing browse-return tests protect interactive explorer context.

`npm run check:export` checks every current index page in the production HTML, its expected canonical record anchors and sitemap inclusion. Hosting checks verify index HTTP responses and invalid-page 404s. These checks run in CI after the production build.

Responsive CSS uses two content columns on larger screens and one below 680px. Index navigation wraps, links have visible keyboard focus, and the expanded header switches to its existing menu below 1000px. Interactive mobile/browser verification requires an available browser; rendered-HTML checks do not establish visual or screen-reader validation.
