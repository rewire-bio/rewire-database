import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import lock from "../benchmark-data.lock.json";
import Footer from "../components/Footer";
import HowToCite from "../components/catalogue/HowToCite";
import LicencePage from "../app/licence/page";
import IndependencePage from "../app/independence/page";
import HomePage from "../app/page";
import UseCasePage from "../app/use-cases/[slug]/page";
import { PredictiveEntityDetail } from "../app/database/_entities/predictive";
import { SITE } from "../lib/agent-connect";
import { buildCatalogue } from "../lib/catalogue-build";
import { DATA_LICENCE, DATABASE_NAME, INDEPENDENCE_PATH, LICENCE_PATH, TAKEDOWN_CONTACT, pageCitation, releaseCitation } from "../lib/data-licence";
import { NOT_STATED, OWNER_STATEMENTS } from "../lib/independence";
import { generateLlmsTxt } from "../lib/llm-discoverability";
import { recordHref } from "../lib/omics";
import { allUseCaseLeaderboards, runReceiptSources } from "../lib/release-leaderboard";
import { ORIGIN_DESCRIPTIONS, ORIGIN_LABELS } from "../lib/result-origin";
import { sitemapEntries } from "../lib/sitemap";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => <a href={href} {...props}>{children}</a>,
}));

const release = lock.release_id;
// React escapes apostrophes in text, so compare against the escaped form.
const escaped = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");

describe("citations", () => {
  it("names the database, the release and the address, and nothing else", () => {
    expect(releaseCitation(release, SITE)).toBe(`${DATABASE_NAME}, release ${release}. ${SITE}/`);
    expect(pageCitation("Use-case leaderboards", "/", release, SITE)).toBe(`Use-case leaderboards. ${DATABASE_NAME}, release ${release}. ${SITE}/`);
    expect(pageCitation("A board", "/use-cases/a-board/", release, SITE)).toBe(`A board. ${DATABASE_NAME}, release ${release}. ${SITE}/use-cases/a-board/`);
  });

  it("prints the citation, the release id and the licence position in the block", () => {
    const html = renderToStaticMarkup(<HowToCite title="A board" path="/use-cases/a-board/" releaseId={release} />);
    expect(html).toContain(`<cite>${pageCitation("A board", "/use-cases/a-board/", release, SITE)}</cite>`);
    expect(html).toContain(`<code>${release}</code>`);
    expect(html).toContain(escaped(DATA_LICENCE.statement));
    expect(html).toContain(`href="${LICENCE_PATH}"`);
    const compact = renderToStaticMarkup(<HowToCite title="A board" path="/use-cases/a-board/" releaseId={release} compact />);
    expect(compact).toContain(`<cite>${pageCitation("A board", "/use-cases/a-board/", release, SITE)}</cite>`);
    expect(compact).toContain(`<code>${release}</code>`);
    expect(compact).toContain(`href="${LICENCE_PATH}"`);
  });

  it("is on the homepage boards, every use-case page and every model page, for the pinned release", () => {
    const home = renderToStaticMarkup(<HomePage />);
    expect(home).toContain(`<cite>${pageCitation("Use-case leaderboards", "/", release, SITE)}</cite>`);

    const board = allUseCaseLeaderboards().find((b) => b.rows.length > 0)!;
    const useCase = renderToStaticMarkup(<UseCasePage params={{ slug: board.use_case_slug }} />);
    expect(useCase).toContain('data-testid="how-to-cite"');
    expect(useCase).toContain(`release ${release}. ${SITE}/use-cases/${board.use_case_slug}/</cite>`);
    expect(useCase).toContain('href="#cite"');

    const { query } = buildCatalogue();
    const model = query.recordsOfKind("model")[0];
    const page = renderToStaticMarkup(<PredictiveEntityDetail detail={query.get({ id: model.id })!} />);
    expect(page).toContain('data-testid="how-to-cite"');
    expect(page).toContain(`release ${release}. ${SITE}${recordHref(model)}</cite>`);
  });
});

describe("data licence", () => {
  it("names CC BY 4.0 and limits it, in the one sentence the API sends, to what Rewire made", () => {
    expect(DATA_LICENCE.spdx_id).toBe("CC-BY-4.0");
    expect(DATA_LICENCE.url).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(DATA_LICENCE.statement).toContain("CC BY 4.0");
    expect(DATA_LICENCE.statement).toContain("not covered by this licence");
    // Pages and tests print the sentence as text: a character React escapes would break the comparison.
    expect(DATA_LICENCE.statement).not.toMatch(/['"&<>]/);
  });

  it("says what is covered, what is not, the non-commercial premise and the takedown contact", () => {
    const html = renderToStaticMarkup(<LicencePage />);
    expect(html).toContain(`<code>${DATA_LICENCE.spdx_id}</code>`);
    expect(html).toContain(`href="${DATA_LICENCE.url}"`);
    expect(html).toContain("What the licence does not cover");
    expect(html).toContain("is not redistributed");
    // Owner determination 1 (rewire-benchmark-data issue 276), with its premise.
    expect(html).toContain("does not sell the benchmark data or the graph, license them to a partner or put them behind a paywall, in whole or in part");
    expect(html).toContain(`mailto:${TAKEDOWN_CONTACT}`);
    expect(html).toContain(`<cite>${releaseCitation(release, SITE)}</cite>`);
    expect(html).toContain(`Release ${release}`);
  });
});

describe("independence policy", () => {
  const html = () => renderToStaticMarkup(<IndependencePage />);

  it("prints every origin label with the description the rest of the site uses", () => {
    const page = html();
    for (const origin of Object.keys(ORIGIN_LABELS)) {
      expect(page).toContain(`<dt>${escaped(ORIGIN_LABELS[origin])}</dt>`);
      expect(page).toContain(escaped(ORIGIN_DESCRIPTIONS[origin]));
    }
  });

  it("counts run receipts from the release and claims no reproduction the release does not hold", () => {
    const page = html();
    const receipts = runReceiptSources(buildCatalogue().query).size;
    const cited = allUseCaseLeaderboards().reduce((n, board) => n + board.rows.filter((row) => row.receipt).length, 0);
    const counts = page.match(/<p data-testid="receipt-counts">([\s\S]*?)<\/p>/)![1];
    expect(counts).toContain(`holds ${receipts.toLocaleString("en-GB")} run receipt`);
    expect(counts.includes("No ranked row cites one")).toBe(cited === 0);
    if (cited > 0) expect(counts).toContain(`${cited.toLocaleString("en-GB")} ranked row`);
    expect(page).not.toContain("Independently reproduced");
  });

  it("prints an owner statement only when the owner has made one", () => {
    const page = html();
    for (const [label, value] of [["Funding", OWNER_STATEMENTS.funding], ["Affiliations", OWNER_STATEMENTS.affiliations]] as const)
      expect(page).toContain(`<dt>${label}</dt><dd>${value === null ? NOT_STATED : escaped(value)}</dd>`);
  });

  it("gives the routes for corrections, disputes and takedown", () => {
    const page = html();
    expect(page).toContain('id="corrections"');
    expect(page).toContain('href="/contribute/"');
    expect(page).toContain('href="/contested/"');
    expect(page).toContain("https://github.com/rewire-bio/rewire-benchmark-data/issues");
    expect(page).toContain(`mailto:${TAKEDOWN_CONTACT}`);
    expect(page).toContain("no payment");
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
