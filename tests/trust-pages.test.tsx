import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import lock from "../benchmark-data.lock.json";
import Footer from "../components/Footer";
import HowToCite from "../components/catalogue/HowToCite";
import LicencePage from "../app/licence/page";
import IndependencePage from "../app/independence/page";
import IndependencePolicy, { releasePolicyFacts } from "../app/independence/policy";
import EvidencePage from "../app/evidence/page";
import MfassV2Page from "../app/runs/mfass-v2/page";
import HomePage from "../app/page";
import UseCasePage from "../app/use-cases/[slug]/page";
import { PredictiveEntityDetail } from "../app/database/_entities/predictive";
import { SITE } from "../lib/agent-connect";
import { buildCatalogue } from "../lib/catalogue-build";
import { CATEGORY_SLUG_MAP } from "../lib/catalogue-seo";
import { catalogueText } from "../lib/catalogue-text";
import {
  CITATION_TITLE_LIMIT, DATA_LICENCE, DATABASE_NAME, INDEPENDENCE_PATH, LICENCE_PATH, TAKEDOWN_CONTACT,
  citationTitle, pageCitation, releaseCitation,
} from "../lib/data-licence";
import { RESOLVED_RULE_LABEL, RULE_DESCRIPTIONS, discrepancyReader, ruleLabel } from "../lib/discrepancies";
import {
  NOT_STATED, OTHER_INTERESTS_NOT_STATED, OTHER_INTERESTS_STATED, OWNER_STATEMENTS, POLICY_INCOMPLETE,
  countOf, ownerStatementsComplete, policyFacts, receiptSentence,
} from "../lib/independence";
import { generateLlmsTxt } from "../lib/llm-discoverability";
import { recordHref } from "../lib/omics";
import { statusLabel } from "../lib/omics-browse";
import {
  HOME_LEFT_OUT, MIN_HOME_PROXY_MODEL_ROWS, MIN_HOME_TOOLS, allUseCaseLeaderboards, homeLeaderboards, runReceiptSources,
} from "../lib/release-leaderboard";
import { ORIGIN_DESCRIPTIONS, ORIGIN_LABELS, ORIGIN_NOT_RECORDED } from "../lib/result-origin";
import { sitemapEntries } from "../lib/sitemap";
import type { LeaderboardResult } from "../lib/use-case-leaderboard";
import { VARIANT_BOARD, fixtureRow } from "./catalogue/fixtures/leaderboards";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => <a href={href} {...props}>{children}</a>,
}));

const release = lock.release_id;
// React escapes these five characters in text, so compare against the escaped form.
const escaped = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
/** The inner markup of the one element carrying a test id. */
const part = (html: string, testId: string) => {
  const match = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`));
  expect(match, testId).not.toBeNull();
  return match![2];
};
/** A page section, from the element with this id to the next section. */
const section = (html: string, id: string) => {
  const start = html.indexOf(`id="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  const end = html.indexOf("<section", start);
  return html.slice(start, end === -1 ? undefined : end);
};
const hrefs = (html: string) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
/** Two full stops in a row that are not part of "...". */
const doubledStop = /(?<!\.)\.\.(?!\.)/;

const PREDICTIVE_KINDS = ["model", "method", "configuration", "pipeline", "service"] as const;

describe("citations", () => {
  it("names the database, the release and the address, and nothing else", () => {
    expect(releaseCitation(release, SITE)).toBe(`${DATABASE_NAME}, release ${release}. ${SITE}/`);
    expect(pageCitation("Use-case leaderboards", "/", release, SITE)).toBe(`Use-case leaderboards. ${DATABASE_NAME}, release ${release}. ${SITE}/`);
    expect(pageCitation("A board", "/use-cases/a-board/", release, SITE)).toBe(`A board. ${DATABASE_NAME}, release ${release}. ${SITE}/use-cases/a-board/`);
  });

  it("does not double the full stop of a title that ends in one", () => {
    expect(pageCitation("BPNet arch.", "/database/configuration/x/", release, SITE)).toBe(`BPNet arch. ${DATABASE_NAME}, release ${release}. ${SITE}/database/configuration/x/`);
    expect(pageCitation("  Reported by Tang et al.  ", "/database/method/y/", release, SITE)).toBe(`Reported by Tang et al. ${DATABASE_NAME}, release ${release}. ${SITE}/database/method/y/`);
  });

  it("cuts a title longer than the limit at a word and marks the cut", () => {
    const exact = "a".repeat(CITATION_TITLE_LIMIT);
    expect(citationTitle(exact)).toBe(exact);
    const long = `Entrant: v49: ${"equal-weight ensemble of two nearly independent predictors, ".repeat(6)}end`;
    const cut = citationTitle(long);
    expect(cut.endsWith("...")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(CITATION_TITLE_LIMIT + 3);
    const kept = cut.slice(0, -3);
    expect(long.startsWith(kept)).toBe(true);
    // The cut falls between words, and no punctuation is left before the dots.
    expect(long[kept.length]).toMatch(/[\s,]/);
    expect(kept).not.toMatch(/[\s.,;:]$/);
    expect(pageCitation(long, "/database/configuration/z/", release, SITE)).toBe(`${cut} ${DATABASE_NAME}, release ${release}. ${SITE}/database/configuration/z/`);
    // A title with no space to cut at is cut at the limit.
    expect(citationTitle("b".repeat(CITATION_TITLE_LIMIT + 40))).toBe(`${"b".repeat(CITATION_TITLE_LIMIT)}...`);
  });

  it("gives every model, method, configuration, pipeline and service in the release a clean citation", () => {
    const { query } = buildCatalogue();
    let checked = 0;
    for (const kind of PREDICTIVE_KINDS) {
      for (const record of query.recordsOfKind(kind)) {
        const citation = pageCitation(catalogueText(record.name), recordHref(record), release, SITE);
        expect(citation, record.id).not.toMatch(doubledStop);
        expect(citation.endsWith(`${DATABASE_NAME}, release ${release}. ${SITE}${recordHref(record)}`), record.id).toBe(true);
        expect(citation.length, record.id).toBeLessThanOrEqual(CITATION_TITLE_LIMIT + 5 + releaseCitation(release, `${SITE}${recordHref(record)}`).length);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("prints the citation, the release id and the licence position in the block", () => {
    const html = renderToStaticMarkup(<HowToCite title="A board" path="/use-cases/a-board/" releaseId={release} />);
    expect(html).toContain(`<cite>${pageCitation("A board", "/use-cases/a-board/", release, SITE)}</cite>`);
    expect(html).toContain(`<code>${release}</code>`);
    expect(html).toContain(escaped(DATA_LICENCE.statement));
    expect(html).toContain(`href="${LICENCE_PATH}"`);
    const compact = renderToStaticMarkup(<HowToCite title="A board" path="/use-cases/a-board/" releaseId={release} className="line links" compact />);
    expect(compact).toContain(`<cite>${pageCitation("A board", "/use-cases/a-board/", release, SITE)}</cite>`);
    expect(compact).toContain(`<code>${release}</code>`);
    expect(compact).toContain(`href="${LICENCE_PATH}"`);
    expect(compact).toMatch(/^<p id="cite" class="line links">/);
  });

  it("is under the homepage boards, with a class that styles its licence link", () => {
    const home = renderToStaticMarkup(<HomePage />);
    expect(home).toContain(`<cite>${pageCitation("Use-case leaderboards", "/", release, SITE)}</cite>`);
    // A bare link inherits the muted text colour (app/globals.css), so the line also takes the class whose links are styled.
    const classes = home.match(/<p id="cite" class="([^"]*)"/)![1].split(" ");
    expect(classes.some((name) => /inlineLinks/.test(name))).toBe(true);
    const css = fs.readFileSync(path.join(__dirname, "../app/database/database.module.css"), "utf8");
    expect(css).toMatch(/\.inlineLinks a \{[^}]*text-decoration: underline/);
  });

  it("is on a use-case page with rows, one without, and cites the use case's own address on a category alias", () => {
    const boards = allUseCaseLeaderboards();
    const withRows = boards.find((b) => b.rows.length > 0)!;
    const withoutRows = boards.find((b) => b.rows.length === 0);
    for (const board of [withRows, withoutRows].filter((b): b is LeaderboardResult => !!b)) {
      const html = renderToStaticMarkup(<UseCasePage params={{ slug: board.use_case_slug }} />);
      expect(html, board.use_case_slug).toContain('<section id="cite"');
      expect(html, board.use_case_slug).toContain(`<cite>${escaped(pageCitation(board.use_case_title, board.use_case_href, release, SITE))}</cite>`);
      expect(html, board.use_case_slug).toContain('href="#cite"');
    }
    const [alias, target] = Object.entries(CATEGORY_SLUG_MAP)[0];
    const aliased = renderToStaticMarkup(<UseCasePage params={{ slug: alias }} />);
    expect(aliased).toContain(`release ${release}. ${SITE}/use-cases/${target}/</cite>`);
    expect(aliased).not.toContain(`${SITE}/use-cases/${alias}/</cite>`);
  }, 120_000);

  it("is on a page of each kind, with the record's name and address", () => {
    const { query } = buildCatalogue();
    for (const kind of PREDICTIVE_KINDS) {
      const record = query.recordsOfKind(kind)[0];
      expect(record, kind).toBeTruthy();
      const html = renderToStaticMarkup(<PredictiveEntityDetail detail={query.get({ id: record.id })!} />);
      expect(html, record.id).toContain('<section id="cite"');
      expect(html, record.id).toContain(`<cite>${escaped(pageCitation(catalogueText(record.name), recordHref(record), release, SITE))}</cite>`);
    }
  }, 120_000);
});

describe("data licence", () => {
  it("names no licence for a whole answer, and names CC BY 4.0 only for what Rewire made", () => {
    // A client that reads only spdx_id or url must not be told that source values are CC BY.
    expect(DATA_LICENCE.spdx_id).toBeNull();
    expect(DATA_LICENCE.name).toBeNull();
    expect(DATA_LICENCE.url).toBeNull();
    expect(DATA_LICENCE.compilation.spdx_id).toBe("CC-BY-4.0");
    expect(DATA_LICENCE.compilation.url).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(DATA_LICENCE.compilation.covers).toContain("selection and arrangement of the records");
    expect(DATA_LICENCE.compilation.excludes).toContain("Values and text taken from cited sources");
    expect(DATA_LICENCE.statement).toContain("CC BY 4.0");
    expect(DATA_LICENCE.statement).toContain("not covered by this licence");
    // Pages and tests print the sentence as text: a character React escapes would break the comparison.
    expect(DATA_LICENCE.statement).not.toMatch(/['"&<>]/);
  });

  it("says what is covered, what is not, the non-commercial premise and the takedown contact", () => {
    const html = renderToStaticMarkup(<LicencePage />);
    expect(html).toContain(`<code>${DATA_LICENCE.compilation.spdx_id}</code>`);
    expect(html).toContain(`href="${DATA_LICENCE.compilation.url}"`);
    expect(html).toContain("<code>licence.compilation</code>");
    expect(html).toContain("What the licence does not cover");
    expect(html).toContain("is not redistributed");
    // Owner determination 1 (rewire-benchmark-data issue 276), with its premise.
    expect(html).toContain("does not sell the benchmark data or the graph, license them to a partner or put them behind a paywall, in whole or in part");
    expect(html).toContain(`mailto:${TAKEDOWN_CONTACT}`);
    expect(html).toContain(`<cite>${releaseCitation(release, SITE)}</cite>`);
    expect(html).toContain(`Release ${release}`);
  });

  it("does not promise a takedown it cannot carry out: git history is named as the limit on both pages", () => {
    const licence = renderToStaticMarkup(<LicencePage />);
    const takedown = section(licence, "takedown-heading");
    expect(takedown).toContain("One limit applies");
    expect(takedown).toContain("git history");
    expect(takedown).toContain('href="#sources-heading"');
    expect(section(licence, "sources-heading")).toContain("git history");
    // The number of pre-policy sources lives in the data repository; the page links the list and prints no count.
    expect(licence).not.toMatch(/\b(?:seven|7) sources\b/i);
    const policy = section(renderToStaticMarkup(<IndependencePage />), "takedown");
    expect(policy).toContain("git history");
    expect(policy).toContain(`href="${LICENCE_PATH}#takedown-heading"`);
    for (const page of [takedown, policy]) expect(page).not.toMatch(/The copy is removed (?:from where it is published and stored|and is not fetched again)/);
  });
});

describe("independence policy for the pinned release", () => {
  const html = () => renderToStaticMarkup(<IndependencePage />);
  const boards = () => allUseCaseLeaderboards();
  const rows = () => boards().flatMap((board) => board.rows);

  it("prints every origin label with the description the rest of the site uses", () => {
    const page = html();
    for (const origin of Object.keys(ORIGIN_LABELS)) {
      expect(page).toContain(`<dt>${escaped(ORIGIN_LABELS[origin])}</dt>`);
      expect(page).toContain(escaped(ORIGIN_DESCRIPTIONS[origin]));
    }
  });

  it("says how many ranked rows have no reported origin, and does not claim every row shows who produced it", () => {
    const page = html();
    const unreported = rows().filter((row) => row.origin === "unreported").length;
    const missing = rows().filter((row) => row.origin === null).length;
    const counts = part(page, "origin-counts");
    expect(counts).toContain(`Of ${countOf(rows().length, "ranked row", "ranked rows")} across all boards`);
    expect(counts).toContain(`${unreported.toLocaleString("en-GB")} read &quot;${escaped(ORIGIN_LABELS.unreported)}&quot;`);
    expect(counts).toContain(`${missing.toLocaleString("en-GB")} read &quot;${escaped(ORIGIN_NOT_RECORDED)}&quot;`);
    expect(page).not.toContain("each row and result shows it");
  });

  it("counts run receipts from the release and claims no reproduction the release does not hold", () => {
    const page = html();
    const receipts = runReceiptSources(buildCatalogue().query).size;
    // Counted from the badge the boards print, not from the receipt link the page counts.
    const reproduced = rows().filter((row) => row.reviewed_status === "reproduced").length;
    expect(rows().filter((row) => row.receipt).length).toBe(reproduced);
    expect(part(page, "receipt-counts")).toBe(`Release <code>${release}</code> holds ${receiptSentence(receipts, reproduced)}`);
    expect(page).not.toContain("Independently reproduced");
  });

  it("states the placement pledge in full, and that the order of rows is not chosen by hand", () => {
    const placement = section(html(), "placement");
    expect(placement).toContain("Rewire takes no payment, from anyone, to include a model, to change where it ranks, to add or remove a label, or to remove a result. There are no sponsored rows.");
    expect(placement).toContain("The order of rows within a board is not chosen by hand.");
    expect(placement).toContain("There is no composite score across protocols.");
  });

  it("says which boards the homepage shows and which it leaves out by hand, from the lists the homepage uses", () => {
    const placement = section(html(), "placement");
    expect(placement).toContain("Which boards the homepage shows, and in what order, is chosen by hand.");
    expect(placement).toContain(`at least ${MIN_HOME_TOOLS} distinct tools`);
    expect(placement).toContain(`at least ${MIN_HOME_PROXY_MODEL_ROWS} foundation-model rows`);
    const home = homeLeaderboards();
    const shown = part(placement, "home-boards");
    expect(hrefs(shown)).toEqual(home.map((board) => board.use_case_href));
    for (const board of home) expect(shown, board.use_case_slug).toContain(`>${escaped(board.use_case_title)}</a>${board.protocol!.relevance === "proxy" ? " (Proxy)" : ""}</li>`);
    const leftOut = part(placement, "home-left-out");
    expect(hrefs(leftOut)).toEqual(Object.keys(HOME_LEFT_OUT).map((slug) => `/use-cases/${slug}/`));
    for (const reason of Object.values(HOME_LEFT_OUT)) expect(leftOut).toContain(`: ${escaped(reason)}</li>`);
  });

  it("says what a proxy board is and how many boards are proxy", () => {
    const ranked = boards().filter((board) => board.protocol && board.rows.length > 0);
    const proxy = ranked.filter((board) => board.protocol!.relevance === "proxy");
    const text = part(html(), "proxy-boards");
    expect(text).toContain("A board marked Proxy ranks on a protocol that was judged a proxy for the use case, not a direct test of it.");
    expect(text).toContain(`${countOf(proxy.length, "board is", "boards are")} proxy, out of ${countOf(ranked.length, "board", "boards")} that rank anything.`);
  });

  it("lists the findings of the disagreement check by rule, counted from the release", () => {
    const reader = discrepancyReader();
    expect(reader.hasDiscrepancies()).toBe(true);
    // Tallied here from the findings themselves, page by page.
    const tally = new Map<string, number>();
    let cursor: string | undefined;
    do {
      const page = reader.discrepancies({ limit: 100, cursor });
      for (const finding of page.items) tally.set(finding.rule, (tally.get(finding.rule) ?? 0) + 1);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    const total = [...tally.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    const corrections = section(html(), "corrections");
    expect(corrections).toContain(`lists ${countOf(total, "finding", "findings")}, by the rule that raised each:`);
    const list = part(corrections, "rule-counts");
    expect([...list.matchAll(/<dt>/g)]).toHaveLength(tally.size);
    for (const [rule, n] of tally) {
      expect(list, rule).toContain(`<dt>${rule ? escaped(ruleLabel(rule)) : RESOLVED_RULE_LABEL}: ${n.toLocaleString("en-GB")}</dt>`);
      // Every rule in the release has a description on the page, so none prints as a bare identifier.
      if (rule) {
        expect(RULE_DESCRIPTIONS[rule], rule).toBeTruthy();
        expect(ruleLabel(rule), rule).not.toBe(rule);
        expect(list).toContain(escaped(RULE_DESCRIPTIONS[rule]));
      }
    }
    // The same position as /contested/: a finding hides nothing, a disputed result is withheld.
    expect(corrections).toContain("A finding by itself never hides a result");
    expect(corrections).toContain("A result is withheld only when it is marked disputed.");
    expect(corrections).not.toContain("it never hides a result");
  });

  it("gives the routes for corrections, disputes and takedown", () => {
    const page = html();
    expect(page).toContain('id="corrections"');
    expect(page).toContain('href="/contribute/"');
    expect(page).toContain('href="/contested/"');
    expect(page).toContain("https://github.com/rewire-bio/rewire-benchmark-data/issues");
    expect(page).toContain(`mailto:${TAKEDOWN_CONTACT}`);
  });

  it("prints the owner's statements as they stand, and says the policy is incomplete while either is missing", () => {
    const page = html();
    for (const [label, value] of [["Funding", OWNER_STATEMENTS.funding], ["Affiliations", OWNER_STATEMENTS.affiliations]] as const)
      expect(page).toContain(`<dt>${label}</dt><dd>${value === null ? NOT_STATED : escaped(value)}</dd>`);
    expect(page.includes(escaped(POLICY_INCOMPLETE))).toBe(!ownerStatementsComplete(OWNER_STATEMENTS));
    expect(page.includes(escaped(OTHER_INTERESTS_NOT_STATED))).toBe(OWNER_STATEMENTS.affiliations === null);
    // The page does not call the project independent in its own words; the labels and the rules carry that.
    expect(page).not.toContain("an independent publication");
  });
});

describe("independence policy in states the pinned release is not in", () => {
  const PROXY_BOARD: LeaderboardResult = {
    ...VARIANT_BOARD,
    use_case_slug: "fixture-proxy",
    use_case_title: "Fixture proxy & co",
    use_case_href: "/use-cases/fixture-proxy/",
    protocol: { ...VARIANT_BOARD.protocol!, relevance: "proxy" },
    rows: [fixtureRow({ model_id: "epsilon", origin: null, independent: false }), fixtureRow({ model_id: "zeta", origin: "unreported", independent: false })],
  };
  const EMPTY_BOARD: LeaderboardResult = { ...VARIANT_BOARD, use_case_slug: "fixture-empty", use_case_href: "/use-cases/fixture-empty/", protocol: null, rows: [] };
  const facts = policyFacts({
    boards: [VARIANT_BOARD, PROXY_BOARD, EMPTY_BOARD],
    homeBoards: [VARIANT_BOARD],
    leftOut: { "fixture-proxy": "A reason the rule cannot see.", "not-a-board": "Never printed." },
    receipts: 2,
    ruleCounts: { "ordering-reversal": 2, "two-study-conflict": 5, "": 1, "a-newer-rule": 1 },
  });
  const render = (statements: { funding: string | null; affiliations: string | null }, given = facts) =>
    renderToStaticMarkup(<IndependencePolicy releaseId="2099-01-01-000000000000" statements={statements} facts={given} />);

  it("works the figures out from the boards and the rule tallies it is given", () => {
    expect(facts).toEqual({
      receipts: 2,
      receiptedRows: 1,
      rankedRows: 6,
      unreportedRows: 2,
      noOriginRows: 1,
      rankedBoards: 2,
      proxyBoards: 1,
      home: [{ slug: "fixture-variant-effect", title: "Fixture variant effect", href: "/use-cases/fixture-variant-effect/", proxy: false }],
      leftOut: [{ slug: "fixture-proxy", title: "Fixture proxy & co", href: "/use-cases/fixture-proxy/", proxy: true, reason: "A reason the rule cannot see." }],
      rules: [
        { rule: "two-study-conflict", findings: 5 },
        { rule: "ordering-reversal", findings: 2 },
        { rule: "", findings: 1 },
        { rule: "a-newer-rule", findings: 1 },
      ],
      findings: 9,
    });
    expect(policyFacts({ boards: [], homeBoards: [], leftOut: {}, receipts: 0, ruleCounts: null })).toMatchObject({ rules: null, findings: 0, rankedBoards: 0, home: [], leftOut: [] });
  });

  it("words the receipt sentence for none, one and several, cited or not", () => {
    expect(receiptSentence(0, 0)).toBe("no run receipts, so no row on any board reads Reproduced.");
    expect(receiptSentence(1, 0)).toBe("1 run receipt. No ranked row cites one, so no row on any board reads Reproduced.");
    expect(receiptSentence(3, 0)).toBe("3 run receipts. No ranked row cites one, so no row on any board reads Reproduced.");
    expect(receiptSentence(1, 1)).toBe("1 run receipt. 1 ranked row cites one and reads Reproduced.");
    expect(receiptSentence(1234, 5678)).toBe("1,234 run receipts. 5,678 ranked rows cite one and read Reproduced.");
  });

  it("prints rows that cite a receipt, proxy and left-out boards, and rules it has no description for", () => {
    const page = render({ funding: "Paid for by its maintainer.", affiliations: "Employed by an organisation that builds no model listed here." });
    expect(part(page, "receipt-counts")).toBe("Release <code>2099-01-01-000000000000</code> holds 2 run receipts. 1 ranked row cites one and reads Reproduced.");
    expect(part(page, "proxy-boards")).toContain("1 board is proxy, out of 2 boards that rank anything.");
    expect(part(page, "origin-counts")).toContain("Of 6 ranked rows across all boards");
    expect(part(page, "home-boards")).toBe('<li><a href="/use-cases/fixture-variant-effect/">Fixture variant effect</a></li>');
    expect(part(page, "home-left-out")).toBe('<li><a href="/use-cases/fixture-proxy/">Fixture proxy &amp; co</a> (Proxy): A reason the rule cannot see.</li>');
    const rules = part(page, "rule-counts");
    expect([...rules.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1])).toEqual([
      "Two-study conflict: 5", "Ordering reversal: 2", `${RESOLVED_RULE_LABEL}: 1`, "a-newer-rule: 1",
    ]);
    expect(rules).toContain("A rule newer than this page.");
    expect(section(page, "corrections")).toContain("lists 9 findings, by the rule that raised each:");
  });

  it("prints the owner's statements when both are made, and no notice that the policy is incomplete", () => {
    const page = render({ funding: "Paid for by its maintainer.", affiliations: "Employed by an organisation that builds no model listed here." });
    expect(page).toContain("<dt>Funding</dt><dd>Paid for by its maintainer.</dd>");
    expect(page).toContain("<dt>Affiliations</dt><dd>Employed by an organisation that builds no model listed here.</dd>");
    expect(page).not.toContain(NOT_STATED);
    expect(page).not.toContain('data-testid="policy-incomplete"');
    expect(part(page, "other-interests")).toBe(escaped(OTHER_INTERESTS_STATED));
  });

  it("says the policy is incomplete, and points at no Affiliations statement, while either is missing", () => {
    const none = render({ funding: null, affiliations: null });
    expect(none).toContain(`<dt>Funding</dt><dd>${NOT_STATED}</dd>`);
    expect(none).toContain(`<dt>Affiliations</dt><dd>${NOT_STATED}</dd>`);
    expect(part(none, "policy-incomplete")).toBe(escaped(POLICY_INCOMPLETE));
    expect(part(none, "other-interests")).toBe(escaped(OTHER_INTERESTS_NOT_STATED));
    expect(none).not.toContain(escaped(OTHER_INTERESTS_STATED));

    const fundingOnly = render({ funding: "Paid for by its maintainer.", affiliations: null });
    expect(part(fundingOnly, "policy-incomplete")).toBe(escaped(POLICY_INCOMPLETE));
    expect(part(fundingOnly, "other-interests")).toBe(escaped(OTHER_INTERESTS_NOT_STATED));

    const affiliationsOnly = render({ funding: null, affiliations: "None that bear on the models listed." });
    expect(part(affiliationsOnly, "policy-incomplete")).toBe(escaped(POLICY_INCOMPLETE));
    expect(part(affiliationsOnly, "other-interests")).toBe(escaped(OTHER_INTERESTS_STATED));
  });

  it("says so when the release has no findings from the disagreement check", () => {
    const page = render({ funding: null, affiliations: null }, { ...facts, rules: null, findings: 0, leftOut: [] });
    expect(section(page, "corrections")).toContain("holds no findings from this check.");
    expect(page).not.toContain('data-testid="rule-counts"');
    expect(page).not.toContain('data-testid="home-left-out"');
  });

  it("reads the same figures as the page", () => {
    const { releaseId, facts: live } = releasePolicyFacts();
    expect(releaseId).toBe(release);
    expect(renderToStaticMarkup(<IndependencePolicy releaseId={releaseId} statements={OWNER_STATEMENTS} facts={live} />)).toBe(renderToStaticMarkup(<IndependencePage />));
  });
});

describe("a record's own reproduced status", () => {
  it("is labelled as a recorded rerun, never as reproduced or independent", () => {
    const label = statusLabel("reproduced");
    expect(label).toBe("Rerun recorded");
    expect(label).not.toMatch(/reproduced|independent/i);
    // Every result and evaluation the release marks reproduced takes that label on its page and in lists.
    const { query } = buildCatalogue();
    for (const kind of ["result", "evaluation"] as const) {
      let cursor: string | undefined;
      do {
        const page = query.list({ kind, status: "reproduced", limit: 100, cursor });
        for (const record of page.items) {
          expect(record.status, record.id).toBe("reproduced");
          expect(statusLabel(record.status), record.id).toBe("Rerun recorded");
        }
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
    }
  });

  it("is defined on the evidence page under the label the records carry, with the receipt rule", () => {
    const html = renderToStaticMarkup(<EvidencePage />);
    expect(html).toContain("<dt>Rerun recorded</dt>");
    expect(html).not.toContain("Independently reproduced");
    expect(html).toContain("Reproduced only when the result or its evaluation cites a run receipt");
    expect(html).toContain('href="/independence/#rewire-runs"');
  });

  it("heads Rewire's own run page with the Rewire run label, not as independent", () => {
    const html = renderToStaticMarkup(<MfassV2Page />);
    expect(html).toContain(`<span class="kick">${ORIGIN_LABELS.rewire_run}</span>`);
    expect(html).not.toContain("Independent rewirebio.io run");
  });

  it("is called independently reproduced nowhere in the site's pages, components or libraries", () => {
    const root = path.join(__dirname, "..");
    const files = ["app", "components", "lib", "shared"].flatMap((dir) =>
      (fs.readdirSync(path.join(root, dir), { recursive: true }) as string[])
        .filter((name) => /\.(tsx?|mjs)$/.test(name))
        .map((name) => path.join(dir, name)));
    expect(files.length).toBeGreaterThan(50);
    const claims = /Independently reproduced|Independent rewirebio\.io run|our reproduced|Record status: reproduced\./;
    expect(files.filter((file) => claims.test(fs.readFileSync(path.join(root, file), "utf8")))).toEqual([]);
  });
});

describe("where the trust pages are linked", () => {
  it("links both from the footer, the sitemap and llms.txt", () => {
    const footer = renderToStaticMarkup(<Footer />);
    const paths = sitemapEntries().map((entry) => entry.path);
    const llms = generateLlmsTxt(release);
    for (const path of [LICENCE_PATH, INDEPENDENCE_PATH]) {
      expect(footer).toContain(`href="${path}"`);
      expect(paths).toContain(path);
      expect(llms).toContain(`${SITE}${path}`);
    }
  });
});
