/**
 * The licence the release data is offered under, and how to cite a release. One place, so the JSON
 * API, its OpenAPI description and its docs page say the same thing.
 *
 * No data licence has been stated yet. Until the owner states one, every field but `statement` is
 * null: the API must not imply terms that nobody has granted. To state a licence, fill the fields
 * here; tests/public-api.test.ts checks that every response carries this object unchanged.
 */
export interface DataLicence {
  /** SPDX identifier, for example "CC-BY-4.0"; null while no licence is stated. */
  spdx_id: string | null;
  name: string | null;
  url: string | null;
  /** One sentence a reader can rely on without the other fields. */
  statement: string;
}

export const DATA_LICENCE: DataLicence = {
  spdx_id: null,
  name: null,
  url: null,
  statement: "No data licence has been stated for this release.",
};

export const DATABASE_NAME = "Rewire biological model benchmark database";

/** The citation for one release: the database's name, the release and the site. Nothing else is asserted. */
export const releaseCitation = (releaseId: string, site: string) => `${DATABASE_NAME}, release ${releaseId}. ${site}/`;
