import * as React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { dataPin } from "./data-pin";
import {
  validRecordPage,
  type EvaluationRecordPage,
  type RecordPage,
  type RecordPageKind,
  type ResultRecordPage,
} from "../services/omics/src/record-pages";
import { recordSearchMetadata } from "./catalogue-seo";
import { socialMetadata } from "./catalogue-sharing";

export type { EvaluationRecordPage, RecordPage, RecordPageKind, ResultRecordPage };

/** The Firebase Functions origin that serves the public catalogue API. */
export const CATALOGUE_API = "https://europe-west2-rewire-it.cloudfunctions.net/contributions";
/** Same identifier rule the API enforces; anything else cannot be a record page. */
const RECORD_ID = /^[a-z0-9][a-z0-9-]{0,254}$/;

/** A backend failure. Never rendered as a missing page and never cached. */
export class RecordPageUnavailable extends Error {}

/**
 * Reads one prepared page for the running revision's data pin. The same
 * release identifies every other page, client API calls and downloads, so a
 * page from any other release is rejected rather than rendered.
 */
export async function fetchRecordPage(
  kind: RecordPageKind,
  id: string,
  {
    api = process.env.REWIRE_CATALOGUE_API || CATALOGUE_API,
    releaseId = dataPin().release_id,
    fetchImpl = fetch,
    timeoutMs = 20_000,
  }: { api?: string; releaseId?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<RecordPage | null> {
  if (!RECORD_ID.test(id)) return null;
  const input = encodeURIComponent(JSON.stringify({ release_id: releaseId, kind, id }));
  let response: Response;
  try {
    response = await fetchImpl(`${api}/api/trpc/catalogue.page?input=${input}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new RecordPageUnavailable("Catalogue page API unreachable", { cause });
  }
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new RecordPageUnavailable(`Catalogue page API returned ${response.status}`);
  }
  const data = ((await response.json()) as { result?: { data?: unknown } })?.result?.data;
  if (data === null) return null;
  if (!validRecordPage(data, kind, id, releaseId))
    throw new RecordPageUnavailable("Catalogue page API returned a page for another release or route");
  return data;
}

// Next's server React provides per-request memoization; plain React 18 (tests) does not.
const cache = (React as { cache?: <T>(fn: T) => T }).cache ?? (<T,>(fn: T) => fn);

/** Deduplicated per request: metadata and the page body share one API read. */
export const loadRecordPage = cache(async function loadRecordPage(kind: RecordPageKind, id: string) {
  const page = await fetchRecordPage(kind, id);
  if (!page) notFound();
  return page;
}) as {
  (kind: "result", id: string): Promise<ResultRecordPage>;
  (kind: "evaluation", id: string): Promise<EvaluationRecordPage>;
};

/** Search and sharing metadata from the page's own context records. */
export function recordPageMetadata(page: RecordPage): Metadata {
  const metadata = recordSearchMetadata(page.detail.record, page.context);
  return {
    ...metadata,
    ...socialMetadata({
      title: metadata.title,
      description: metadata.description,
      path: metadata.alternates.canonical,
    }),
  };
}
