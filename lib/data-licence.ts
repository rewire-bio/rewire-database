/**
 * The licence the release data is offered under, and how to cite a release. One place, so the JSON
 * API, its OpenAPI description, the licence page and the "How to cite" blocks say the same thing.
 *
 * The licence covers what Rewire compiled and wrote. It does not cover values and text taken from
 * cited sources, and `statement` has to say so by itself, because the API sends it without the
 * page. The limits are spelled out on the licence page (app/licence/page.tsx) and follow the owner
 * determinations in rewire-benchmark-data issue 276. tests/public-api.test.ts checks that every
 * response carries this object unchanged.
 */
export interface DataLicence {
  /** SPDX identifier, for example "CC-BY-4.0"; null when no licence is stated. */
  spdx_id: string | null;
  name: string | null;
  url: string | null;
  /** One sentence a reader can rely on without the other fields. */
  statement: string;
}

export const DATA_LICENCE: DataLicence = {
  spdx_id: "CC-BY-4.0",
  name: "Creative Commons Attribution 4.0 International",
  url: "https://creativecommons.org/licenses/by/4.0/",
  statement: "The compilation and annotations made by Rewire in this release are offered under CC BY 4.0; values and text taken from cited sources stay under the terms of those sources and are not covered by this licence.",
};

export const DATABASE_NAME = "Rewire biological model benchmark database";
export const LICENCE_PATH = "/licence/";
export const INDEPENDENCE_PATH = "/independence/";
/** The takedown and licence contact, from owner determination 4 in rewire-benchmark-data issue 276. */
export const TAKEDOWN_CONTACT = "tim@rewire.it";

/** The citation for one release: the database's name, the release and the site. Nothing else is asserted. */
export const releaseCitation = (releaseId: string, site: string) => `${DATABASE_NAME}, release ${releaseId}. ${site}/`;

/**
 * The citation for one page of a release: the page's title, then the release citation with the
 * page's own address in place of the site's. `path` is a site path with both slashes.
 */
export const pageCitation = (title: string, path: string, releaseId: string, site: string) =>
  `${title}. ${releaseCitation(releaseId, `${site}${path.replace(/\/$/, "")}`)}`;
