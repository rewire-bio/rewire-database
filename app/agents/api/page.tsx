import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import CodeBlock from "@/components/agents/CodeBlock";
import { SITE } from "@/lib/agent-connect";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { DATA_LICENCE, releaseCitation } from "@/lib/data-licence";
import { dataPin } from "@/lib/data-pin";
import { API_BASE, API_CACHE_CONTROL, API_DOCS_PATH, ENDPOINTS } from "@/lib/public-api";
import styles from "../agents.module.css";

export const dynamic = "force-dynamic";

const pageMetadata = {
  title: "JSON API | Benchmark database",
  description: "Read the benchmark database as JSON: models, benchmarks, use-case leaderboards, a model's results and contested findings. No key needed.",
  alternates: { canonical: `${SITE}${API_DOCS_PATH}` },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

const fields = [
  { name: "release", text: "The data release every value in the answer was read from: its id, date, the repository and commit it was built from, and the release manifest with checksums." },
  { name: "licence", text: "The data licence. Its statement field gives the position in one sentence." },
  { name: "citation", text: "How to cite the release." },
  { name: "links", text: "The answer's own address, this page, the OpenAPI description and the page of this site that shows the same content." },
  { name: "page", text: "On lists: the total, and the cursor and address of the next page." },
  { name: "data", text: "The answer itself." },
];

const rules = [
  "A leaderboard ranks one use case on one protocol and one metric. Ranks are never combined across protocols and there is no composite score.",
  "Boards, a model's rankings and its results name things the same way. numeric_value is the value as the result record holds it, in the unit given beside it. display_value is the text the site prints, which may show a fraction as a percentage. Every url is absolute.",
  "protocol.relevance is direct when the use case's reviewers judged the protocol directly relevant, and proxy when a related protocol is used because no direct one ranks two tools.",
  "review_status is reproduced only when the result or its evaluation cites a run receipt in the release; the receipt field then links it. source_checked means the value was checked against the source it cites. It does not mean the result was rerun. superseded means the release has replaced the result and keeps it for reference.",
  "record_status is the record's own review state in the release, with one exception: a record the release marks reproduced is given as source_checked, because this API says reproduced only in review_status, and only with a cited run receipt.",
  "origin says who produced a result. independent is true only for a study whose authors did not develop the tool. A Rewire run has origin rewire_run and is not counted as independent.",
  "Every result links each source it cites: the source's page here, and its own address when the record gives one.",
  "A contested finding is an automatic lead that studies disagree. It is not a finding of error and never withholds a result.",
  "Each finding, and each link to one, carries listing: public for a finding the release lists as a lead for readers, review for one it lists for curation only. The contested list holds both unless you filter by listing.",
  "A filter value the release cannot match is answered with 400, not with an empty list: an unknown parameter, a metric the model has no result for, or a system that is not a record.",
];

export default function ApiDocsPage() {
  const releaseId = dataPin().release_id;
  const url = (path: string) => `${SITE}${API_BASE}${path}`;
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Connect your agent", path: "/agents/" }, { name: "JSON API", path: API_DOCS_PATH }]}
      eyebrow={["API", `Release ${releaseId}`]}
      title="JSON API"
      intro="Read the release this site serves as JSON. The API is read-only and needs no key. Every answer names the release it was read from."
    />
    <div className="wrap content">
      <section aria-labelledby="try-heading" className={styles.section}>
        <h2 id="try-heading">Try it</h2>
        <CodeBlock code={`curl ${url("/use-cases/")}`} />
        <p>Addresses end in a slash; an address without one is redirected. The machine-readable description is at <a href={`${API_BASE}/openapi.json`}>{API_BASE}/openapi.json</a> (OpenAPI 3.1).</p>
      </section>

      <section aria-labelledby="endpoints-heading" className={styles.section}>
        <h2 id="endpoints-heading">Endpoints</h2>
        <ul>
          {ENDPOINTS.map((endpoint) => <li key={endpoint.id}>
            <code>GET {API_BASE}{endpoint.path}</code>: {endpoint.description}
            {endpoint.query && <> Query parameters: {Object.keys(endpoint.query).map((name, i) => <span key={name}>{i > 0 && ", "}<code>{name}</code></span>)}.</>}
          </li>)}
        </ul>
        <p>Every endpoint also takes <code>release_id</code>. A request pinned to a release other than the one served is answered with 404, never from another release. An unknown query parameter is answered with 400.</p>
      </section>

      <section aria-labelledby="answer-heading" className={styles.section}>
        <h2 id="answer-heading">What every answer carries</h2>
        <ul>
          {fields.map((field) => <li key={field.name}><code>{field.name}</code>: {field.text}</li>)}
        </ul>
        <p>Data licence: {DATA_LICENCE.statement}</p>
        <p>Citation for this release: {releaseCitation(releaseId, SITE)}</p>
      </section>

      <section aria-labelledby="reading-heading" className={styles.section}>
        <h2 id="reading-heading">How to read the answers</h2>
        <ul>
          {rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </section>

      <section aria-labelledby="releases-heading" className={styles.section}>
        <h2 id="releases-heading">Releases and caching</h2>
        <p>Every value in an answer is read from the release named in <code>release.id</code>, and a new release replaces the old one at the same addresses. Ranks, labels and counts are worked out by this site from the release, so they can also change when the site&apos;s code changes; the <code>X-Rewire-Frontend</code> response header names the site version. Answers are sent with <code>Cache-Control: {API_CACHE_CONTROL}</code>, so a client may reuse one for five minutes; the release it came from is always in its body. To keep answers longer, key them by both the release and the site version. Cursors are valid only for the release and filters they came from. The API holds no keys, accounts or quotas of its own.</p>
        <p>The whole release is also available as files, with checksums, from the <a href="/#downloads">downloads</a> and the <a href="/release-manifest.json">release manifest</a>.</p>
      </section>

      <p className={styles.footnote}>Other ways for an agent to read the database are on <a href="/agents/">Connect your agent</a>.</p>
    </div>
  </>;
}
