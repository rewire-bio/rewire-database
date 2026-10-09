import * as React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { localRecordPage } from "./record-page-local";
import {
  type EvaluationRecordPage,
  type RecordPage,
  type RecordPageKind,
  type ResultRecordPage,
} from "../lib/record-pages";
import { recordSearchMetadata } from "./catalogue-seo";
import { socialMetadata } from "./catalogue-sharing";

export type { EvaluationRecordPage, RecordPage, RecordPageKind, ResultRecordPage };

/**
 * Builds one page for the running revision's release from its prepared file:
 * bounded reads of that record, its rows and its context, in milliseconds.
 */
export function readRecordPage(kind: RecordPageKind, id: string): RecordPage | null {
  return localRecordPage(kind, id);
}

// Next's server React provides per-request memoization; plain React 18 (tests) does not.
const cache = (React as { cache?: <T>(fn: T) => T }).cache ?? (<T,>(fn: T) => fn);

/** Deduplicated per request: metadata and the page body share one build. */
export const loadRecordPage = cache(async function loadRecordPage(kind: RecordPageKind, id: string) {
  const page = readRecordPage(kind, id);
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
