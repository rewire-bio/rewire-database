import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { SITE } from "@/lib/agent-connect";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { buildCatalogue } from "@/lib/catalogue-build";
import { INDEPENDENCE_PATH, LICENCE_PATH, TAKEDOWN_CONTACT } from "@/lib/data-licence";
import { DISCREPANCIES_DOC } from "@/lib/discrepancies";
import { NOT_STATED, OWNER_STATEMENTS } from "@/lib/independence";
import { allUseCaseLeaderboards, runReceiptSources } from "@/lib/release-leaderboard";
import { ORIGIN_DESCRIPTIONS, ORIGIN_LABELS } from "@/lib/result-origin";
import styles from "@/app/database/database.module.css";

export const dynamic = "force-dynamic";

const pageMetadata = {
  title: "Independence policy | Benchmark database",
  description: "Who runs the Rewire benchmark database, what it will not take payment for, how results are labelled by who produced them, and how corrections, disputes and takedowns are handled.",
  alternates: { canonical: `${SITE}${INDEPENDENCE_PATH}` },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

const DATA_REPOSITORY = "https://github.com/rewire-bio/rewire-benchmark-data";
const RUNNER_REPOSITORY = "https://github.com/rewire-bio/rewire-benchmarks";
const SITE_REPOSITORY = "https://github.com/rewire-bio/rewire-database";

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

export default function IndependencePage() {
  const { catalogue, query } = buildCatalogue();
  // Counted from the release on each request, so the page cannot claim more than the release holds.
  const receipts = runReceiptSources(query).size;
  const receiptedRows = allUseCaseLeaderboards().reduce((n, board) => n + board.rows.filter((row) => row.receipt).length, 0);
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Independence policy", path: INDEPENDENCE_PATH }]}
      eyebrow={["Policy", `Release ${catalogue.release_id}`]}
      title="Independence policy"
      intro="Who runs this database, what it will not take payment for, how each result is labelled by who produced it, and what happens when someone says a result is wrong."
    />
    <section className="block first">
      <div className="wrap">
        <section className={styles.section} id="who" aria-labelledby="who-heading">
          <h2 id="who-heading">Who runs it and who pays for it</h2>
          <p>
            The database is part of Rewire, an independent publication and computational project written and maintained by Tim Richardson. The project is described on <a href="https://rewirebio.io/about/">rewirebio.io</a>.
          </p>
          <dl className={styles.details}>
            <dt>Funding</dt>
            <dd>{OWNER_STATEMENTS.funding ?? NOT_STATED}</dd>
            <dt>Affiliations</dt>
            <dd>{OWNER_STATEMENTS.affiliations ?? NOT_STATED}</dd>
          </dl>
          <p>
            The data is not sold. Rewire does not sell the benchmark data or the graph, license them to a partner or put them behind a paywall, in whole or in part. The JSON API needs no key and the release files are free to download. Terms of reuse are on the <Link href={LICENCE_PATH}>data licence</Link> page.
          </p>
        </section>

        <section className={styles.section} id="placement" aria-labelledby="placement-heading">
          <h2 id="placement-heading">No payment for placement</h2>
          <p>
            Rewire takes no payment, from anyone, to include a model, to change where it ranks, to add or remove a label, or to remove a result. There are no sponsored rows.
          </p>
          <p>
            A board&apos;s order is not chosen by hand. Each board ranks one use case on one protocol and one metric, in the order of the recorded values, and every row comes from a result record in the release. There is no composite score across protocols. The rules that pick the protocol and build the rows are in the <a href={SITE_REPOSITORY}>site&apos;s public code</a>, and the records are in the <a href={DATA_REPOSITORY}>data repository</a>.
          </p>
          <p>
            A model&apos;s developers have the same route as anyone else to add evidence or ask for a correction.
          </p>
        </section>

        <section className={styles.section} id="labels" aria-labelledby="labels-heading">
          <h2 id="labels-heading">How results are labelled by who produced them</h2>
          <p>The release records who produced each evaluation, and each row and result shows it:</p>
          <dl className={styles.details}>
            {Object.keys(ORIGIN_LABELS).map((origin) => <Fragment key={origin}>
              <dt>{ORIGIN_LABELS[origin]}</dt>
              <dd>{ORIGIN_DESCRIPTIONS[origin]}</dd>
            </Fragment>)}
          </dl>
          <p>
            Only an independent study counts as independent of a tool&apos;s developers. A developer-reported value is shown and ranked like any other, with its label beside it. A value whose source does not say who ran the tool is not counted as independent.
          </p>
        </section>

        <section className={styles.section} id="rewire-runs" aria-labelledby="runs-heading">
          <h2 id="runs-heading">How Rewire&apos;s own results are produced and receipted</h2>
          <p>
            A result that Rewire ran itself is labelled Rewire run. It is not counted as independent, because Rewire wrote some of the baselines and controls it runs. The code for Rewire&apos;s runs is published in the <a href={RUNNER_REPOSITORY}>benchmark runner repository</a>.
          </p>
          <p>
            Checking a value against its source is not the same as rerunning it. Source-checked means the recorded value was compared with the source it cites. On a leaderboard and in the JSON API, a result reads Reproduced only when the result or its evaluation cites a run receipt: the record of an executed run of the full protocol, held in the release.
          </p>
          <p data-testid="receipt-counts">
            Release <code>{catalogue.release_id}</code> holds {count(receipts, "run receipt", "run receipts")}. {receiptedRows === 0
              ? "No ranked row cites one, so no row on any board reads Reproduced."
              : `${count(receiptedRows, "ranked row cites", "ranked rows cite")} one and ${receiptedRows === 1 ? "reads" : "read"} Reproduced.`}
          </p>
          <p>
            Review of the records is automated. No statement on this site has had human sign-off unless the page says so. See <Link href="/evidence/">evidence and sources</Link> for what each review status means.
          </p>
        </section>

        <section className={styles.section} id="corrections" aria-labelledby="corrections-heading">
          <h2 id="corrections-heading">Corrections and disputes</h2>
          <p>To report a wrong value, a wrong attribution or a missing result, use any of these:</p>
          <ul className={styles.list}>
            <li>the <Link href="/contribute/">contribution form</Link>;</li>
            <li>an issue on the <a href={`${DATA_REPOSITORY}/issues`}>data repository</a>;</li>
            <li>email to <a href={`mailto:${TAKEDOWN_CONTACT}`}>{TAKEDOWN_CONTACT}</a>.</li>
          </ul>
          <p>
            Nothing sent in is published automatically. A correction is made by changing the record in the data repository and publishing a new release. Earlier releases are not rewritten, and a record that has been replaced stays in the release, marked superseded.
          </p>
          <p>
            When studies disagree, the site does not pick a side by hand. Each release checks whether one study ranks models against the order other studies agree on, and lists each case under <Link href="/contested/">contested results</Link> with the studies on each side. A listing is a lead to check, not a finding of error, and it never hides a result. The follow-up on each one is recorded with it and shown: what was investigated, what was reported to the authors and what was corrected. The rules are in the <a href={DISCREPANCIES_DOC}>discrepancy documentation</a>.
          </p>
          <p>
            If you developed a tool and think a result misrepresents it, the routes above are open to you. A reply from a tool&apos;s developers is recorded against the finding it answers. It does not remove the other studies&apos; results.
          </p>
        </section>

        <section className={styles.section} id="takedown" aria-labelledby="takedown-heading">
          <h2 id="takedown-heading">Takedown</h2>
          <p>
            A rights holder who wants a stored copy of a source removed should write to <a href={`mailto:${TAKEDOWN_CONTACT}`}>{TAKEDOWN_CONTACT}</a>. The copy is removed and is not fetched again; the citation stays. Details are on the <Link href={`${LICENCE_PATH}#takedown-heading`}>data licence</Link> page.
          </p>
        </section>

        <section className={styles.section} id="conflicts" aria-labelledby="conflicts-heading">
          <h2 id="conflicts-heading">Conflicts of interest</h2>
          <p>
            Rewire scores some methods that it wrote: baselines and controls in its own runs. Those results carry the Rewire run label and are never counted as independent.
          </p>
          <p>
            Other interests that bear on the models listed here are given under Affiliations above.
          </p>
        </section>
      </div>
    </section>
  </>;
}
