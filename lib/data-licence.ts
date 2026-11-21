/**
 * The licence position for the release data, and how to cite a release. One place, so the JSON
 * API, its OpenAPI description, the licence page and the "How to cite" blocks say the same thing.
 *
 * No single licence covers an API answer or a release file: most of what they hold is values taken
 * from cited sources, which stay under the terms of those sources. So the top-level `spdx_id`,
 * `name` and `url` are null, and a client that reads only those fields is told nothing it could
 * apply to a source's values. The licence Rewire grants is in `compilation`, with `covers` and
 * `excludes` beside the identifier. `statement` has to say both by itself, because a reader may
 * see it without the other fields. The limits are spelled out on the licence page
 * (app/licence/page.tsx) and follow the owner determinations in rewire-benchmark-data issue 276.
 * tests/public-api.test.ts checks that every response carries this object unchanged.
 */
export interface ScopedLicence {
  /** SPDX identifier, for example "CC-BY-4.0". */
  spdx_id: string;
  name: string;
  url: string;
  /** What the identifier applies to. */
  covers: string;
  /** What it does not apply to. */
  excludes: string;
}

export interface DataLicence {
  /** SPDX identifier of a licence covering everything in the answer; null because none does. */
  spdx_id: string | null;
  name: string | null;
  url: string | null;
  /** One sentence a reader can rely on without the other fields. */
  statement: string;
  /** The licence for the part Rewire made. It never applies to values or text taken from sources. */
  compilation: ScopedLicence;
}

export const DATA_LICENCE: DataLicence = {
  spdx_id: null,
  name: null,
  url: null,
  statement: "The compilation and annotations made by Rewire in this release are offered under CC BY 4.0; values and text taken from cited sources stay under the terms of those sources and are not covered by this licence.",
  compilation: {
    spdx_id: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0 International",
    url: "https://creativecommons.org/licenses/by/4.0/",
    covers: "The selection and arrangement of the records, their identifiers and links, use-case definitions, relevance judgements, review statuses, origin labels, discrepancy findings and follow-up, summaries written for the database, and the results of runs Rewire carried out.",
    excludes: "Values and text taken from cited sources, the licence text recorded for a model, and the source documents. Each stays under the terms of its source.",
  },
};

export const DATABASE_NAME = "Rewire biological model benchmark database";
export const LICENCE_PATH = "/licence/";
export const INDEPENDENCE_PATH = "/independence/";
/** The takedown and licence contact, from owner determination 4 in rewire-benchmark-data issue 276. */
export const TAKEDOWN_CONTACT = "tim@rewire.it";

/** The citation for one release: the database's name, the release and the site. Nothing else is asserted. */
export const releaseCitation = (releaseId: string, site: string) => `${DATABASE_NAME}, release ${releaseId}. ${site}/`;

/** Longest page title a citation prints in full. */
export const CITATION_TITLE_LIMIT = 150;

/**
 * A page title as a citation prints it: a title over the limit is cut at the last word that fits
 * and ends in "...", because some configuration records are named with a paragraph. The page's
 * address, which carries the record id, is what identifies it.
 */
export function citationTitle(title: string): string {
  const text = title.trim().replace(/\s+/g, " ");
  if (text.length <= CITATION_TITLE_LIMIT) return text;
  const cut = text.slice(0, CITATION_TITLE_LIMIT + 1);
  const space = cut.lastIndexOf(" ");
  const words = space > 0 ? cut.slice(0, space) : cut.slice(0, CITATION_TITLE_LIMIT);
  return `${words.replace(/[\s.,;:]+$/, "")}...`;
}

/**
 * The citation for one page of a release: the page's title, then the release citation with the
 * page's own address in place of the site's. `path` is a site path with both slashes. A title that
 * already ends in a full stop ("BPNet arch.") is not given a second one.
 */
export const pageCitation = (title: string, path: string, releaseId: string, site: string) => {
  const cited = citationTitle(title);
  return `${cited}${cited.endsWith(".") ? "" : "."} ${releaseCitation(releaseId, `${site}${path.replace(/\/$/, "")}`)}`;
};
