import { Fragment } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { buildCatalogue } from "@/lib/catalogue-build";
import { INDEPENDENCE_PATH, LICENCE_PATH, TAKEDOWN_CONTACT } from "@/lib/data-licence";
import {
  DISCREPANCIES_DOC, RESOLVED_RULE_DESCRIPTION, RESOLVED_RULE_LABEL, RULE_DESCRIPTIONS, discrepancyReader, ruleLabel,
} from "@/lib/discrepancies";
import {
  OTHER_INTERESTS_STATED, WHO_AND_FUNDING_HEADING, WHO_HEADING,
  countOf, policyFacts, receiptSentence, statedOwnerStatements, type OwnerStatements, type PolicyFacts,
} from "@/lib/independence";
import {
  HOME_LEFT_OUT, MIN_HOME_PROXY_MODEL_ROWS, MIN_HOME_TOOLS, allUseCaseLeaderboards, homeLeaderboards, runReceiptSources,
} from "@/lib/release-leaderboard";
import { ORIGIN_DESCRIPTIONS, ORIGIN_LABELS, ORIGIN_NOT_RECORDED } from "@/lib/result-origin";
import styles from "@/app/database/database.module.css";

const DATA_REPOSITORY = "https://github.com/rewire-bio/rewire-benchmark-data";
const RUNNER_REPOSITORY = "https://github.com/rewire-bio/rewire-benchmarks";
const SITE_REPOSITORY = "https://github.com/rewire-bio/rewire-database";

/** The page's figures for the pinned release, counted on each request so it cannot claim more than the release holds. */
export function releasePolicyFacts(): { releaseId: string; facts: PolicyFacts } {
  const { catalogue, query } = buildCatalogue();
  const reader = discrepancyReader();
  return {
    releaseId: catalogue.release_id,
    facts: policyFacts({
      boards: allUseCaseLeaderboards(),
      homeBoards: homeLeaderboards(),
      leftOut: HOME_LEFT_OUT,
      receipts: runReceiptSources(query).size,
      ruleCounts: reader.hasDiscrepancies() ? reader.discrepancies({ limit: 1 }).counts.rule : null,
    }),
  };
}

/**
 * The policy's text. The owner's statements and the release figures are arguments, so the tests
 * render the states the live page is not in: statements made, rows that cite a receipt. A statement
 * the owner has not made prints nothing: no row, no placeholder, and no sentence that refers to it.
 */
export default function IndependencePolicy({ releaseId, statements, facts }: {
  releaseId: string;
  statements: OwnerStatements;
  facts: PolicyFacts;
}) {
  const stated = statedOwnerStatements(statements);
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Independence policy", path: INDEPENDENCE_PATH }]}
      eyebrow={["Policy", `Release ${releaseId}`]}
      title="Independence policy"
      intro="Who runs this database, what it will not take payment for, how each result is labelled by who produced it, and what happens when someone says a result is wrong."
    />
    <section className="block first">
      <div className="wrap">
        <section className={styles.section} id="who" aria-labelledby="who-heading">
          <h2 id="who-heading">{statements.funding === null ? WHO_HEADING : WHO_AND_FUNDING_HEADING}</h2>
          <p>
            The database is part of Rewire, a publication and computational project written and maintained by Tim Richardson. The project is described on <a href="https://rewirebio.io/about/">rewirebio.io</a>.
          </p>
          {stated.length > 0 && <dl className={styles.details} data-testid="owner-statements">
            {stated.map(({ label, text }) => <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{text}</dd>
            </Fragment>)}
          </dl>}
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
            The order of rows within a board is not chosen by hand. Each board ranks one use case on one protocol and one metric, in the order of the recorded values, and every row comes from a result record in the release. There is no composite score across protocols. The rules that pick the protocol and build the rows are in the <a href={SITE_REPOSITORY}>site&apos;s public code</a>, and the records are in the <a href={DATA_REPOSITORY}>data repository</a>.
          </p>
          <p data-testid="proxy-boards">
            A board marked Proxy ranks on a protocol that was judged a proxy for the use case, not a direct test of it. It is used only when the use case has no directly relevant protocol that can be ranked, and it keeps the label wherever it is shown. In release <code>{releaseId}</code>, {countOf(facts.proxyBoards, "board is", "boards are")} proxy, out of {countOf(facts.rankedBoards, "board", "boards")} that rank anything.
          </p>
          <p>
            Which boards the homepage shows, and in what order, is chosen by hand. The choice is written in the site&apos;s code and works like this. A board can appear only if it ranks at least {MIN_HOME_TOOLS} distinct tools; a proxy board must also have at least {MIN_HOME_PROXY_MODEL_ROWS} foundation-model rows and more than half its rows from independent studies. Directly relevant boards come first. Within that, the order is Rewire&apos;s. Every use case has its board on its own page under <Link href="/use-cases/">use cases</Link>, whether or not the homepage shows it.
          </p>
          <p>The homepage shows these boards, in this order:</p>
          <ul className={styles.list} data-testid="home-boards">
            {facts.home.map((board) => <li key={board.slug}><Link href={board.href}>{board.title}</Link>{board.proxy ? " (Proxy)" : ""}</li>)}
          </ul>
          {facts.leftOut.length > 0 && <>
            <p>These boards meet the rule and are left off the homepage by hand, each for the reason given:</p>
            <ul className={styles.list} data-testid="home-left-out">
              {facts.leftOut.map((board) => <li key={board.slug}><Link href={board.href}>{board.title}</Link>{board.proxy ? " (Proxy)" : ""}: {board.reason}</li>)}
            </ul>
          </>}
          <p>
            A model&apos;s developers have the same route as anyone else to add evidence or ask for a correction.
          </p>
        </section>

        <section className={styles.section} id="labels" aria-labelledby="labels-heading">
          <h2 id="labels-heading">How results are labelled by who produced them</h2>
          <p>Each evaluation in the release carries an origin, and each ranked row and result page prints it. The origin is one of these:</p>
          <dl className={styles.details}>
            {Object.keys(ORIGIN_LABELS).map((origin) => <Fragment key={origin}>
              <dt>{ORIGIN_LABELS[origin]}</dt>
              <dd>{ORIGIN_DESCRIPTIONS[origin]}</dd>
            </Fragment>)}
          </dl>
          <p data-testid="origin-counts">
            The label is only as good as the source. Of {countOf(facts.rankedRows, "ranked row", "ranked rows")} across all boards in release <code>{releaseId}</code>, {facts.unreportedRows.toLocaleString("en-GB")} read &quot;{ORIGIN_LABELS.unreported}&quot; and {facts.noOriginRows.toLocaleString("en-GB")} read &quot;{ORIGIN_NOT_RECORDED}&quot;.
          </p>
          <p>
            Only an independent study counts as independent of a tool&apos;s developers. A developer-reported value is shown and ranked like any other, with its label beside it. A value whose source does not say who ran the tool is not counted as independent.
          </p>
        </section>

        <section className={styles.section} id="rewire-runs" aria-labelledby="runs-heading">
          <h2 id="runs-heading">How Rewire&apos;s own results are produced and receipted</h2>
          <p>
            A result that Rewire ran itself is labelled Rewire run. It is not counted as independent, because Rewire wrote some of the baselines and controls it runs. The runner is published in the <a href={RUNNER_REPOSITORY}>benchmark runner repository</a>.
          </p>
          <p>
            Checking a value against its source is not the same as rerunning it. Source-checked means the recorded value was compared with the source it cites. On a leaderboard and in the JSON API, a result reads Reproduced only when the result or its evaluation cites a run receipt: the record of an executed run of the full protocol, held in the release. A record&apos;s own status in the release can say that a rerun was recorded without a receipt being cited. On this site&apos;s pages that status reads Rerun recorded, not Reproduced; the release files keep the status as the data repository wrote it.
          </p>
          <p data-testid="receipt-counts">
            Release <code>{releaseId}</code> holds {receiptSentence(facts.receipts, facts.receiptedRows)}
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
            When studies disagree, the site does not pick a side by hand. Each release runs an automatic check over the studies that report on the same models and lists what it finds under <Link href="/contested/">contested results</Link>, with the studies on each side.
            {facts.rules ? <> Release <code>{releaseId}</code> lists {countOf(facts.findings, "finding", "findings")}, by the rule that raised each:</> : <> Release <code>{releaseId}</code> holds no findings from this check.</>}
          </p>
          {facts.rules && <dl className={styles.details} data-testid="rule-counts">
            {facts.rules.map(({ rule, findings }) => <Fragment key={rule || "resolved"}>
              <dt>{rule ? ruleLabel(rule) : RESOLVED_RULE_LABEL}: {findings.toLocaleString("en-GB")}</dt>
              <dd>{rule ? RULE_DESCRIPTIONS[rule] ?? "A rule newer than this page. The discrepancy documentation describes it." : RESOLVED_RULE_DESCRIPTION}</dd>
            </Fragment>)}
          </dl>}
          <p>
            A finding is a lead to check, not a finding of error. A finding by itself never hides a result: the results it names stay in every table, page and download, marked Contested. A result is withheld only when it is marked disputed. The follow-up on each finding is recorded with it and shown: what was investigated, what was reported to the authors and what was corrected. The rules are in the <a href={DISCREPANCIES_DOC}>discrepancy documentation</a>.
          </p>
          <p>
            If you developed a tool and think a result misrepresents it, the routes above are open to you. Rewire&apos;s practice is to record a reply from a tool&apos;s developers against the finding it answers. A reply does not remove the other studies&apos; results.
          </p>
        </section>

        <section className={styles.section} id="takedown" aria-labelledby="takedown-heading">
          <h2 id="takedown-heading">Takedown</h2>
          <p>
            A rights holder who wants a stored copy of a source removed should write to <a href={`mailto:${TAKEDOWN_CONTACT}`}>{TAKEDOWN_CONTACT}</a>. The copy is removed from the release assets, the private store and the working caches, and is not fetched again; the citation stays. One limit applies: a file that was committed to the public data repository cannot be removed from that repository&apos;s git history. Which sources that affects, and the rest of the detail, are on the <Link href={`${LICENCE_PATH}#takedown-heading`}>data licence</Link> page.
          </p>
        </section>

        <section className={styles.section} id="conflicts" aria-labelledby="conflicts-heading">
          <h2 id="conflicts-heading">Conflicts of interest</h2>
          <p>
            Rewire scores some methods that it wrote: baselines and controls in its own runs. Those results carry the Rewire run label and are never counted as independent.
          </p>
          {statements.affiliations !== null && <p data-testid="other-interests">{OTHER_INTERESTS_STATED}</p>}
        </section>
      </div>
    </section>
  </>;
}
