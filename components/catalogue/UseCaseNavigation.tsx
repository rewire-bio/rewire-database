"use client";

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { readUseCaseFilters, encodeUseCaseSearch } from "@/lib/use-cases-client";

function contextSearch(search: string) {
  return encodeUseCaseSearch(readUseCaseFilters(search), new URLSearchParams(search).get("cursor") || undefined);
}

function ContextLink({ href, useCasePath, children }: { href: string; useCasePath: string; children: ReactNode }) {
  const search = useSearchParams();
  const destination = new URL(href, "https://benchmarks.rewire.it");
  destination.searchParams.set("return_to", useCasePath + contextSearch(search.toString()));
  return <a href={`${destination.pathname}${destination.search}${destination.hash}`}>{children}</a>;
}

/** Only the link is reactive; question, scope and evidence stay in exported HTML. */
export function UseCaseRecordLink({ href, useCasePath, children }: { href: string; useCasePath: string; children: ReactNode }) {
  const destination = new URL(href, "https://benchmarks.rewire.it");
  destination.searchParams.set("return_to", useCasePath);
  return <Suspense fallback={<a href={`${destination.pathname}${destination.search}${destination.hash}`}>{children}</a>}>
    <ContextLink href={href} useCasePath={useCasePath}>{children}</ContextLink>
  </Suspense>;
}

function IndexReturn({ label }: { label: ReactNode }) {
  const search = useSearchParams();
  return <a href={`/use-cases/${contextSearch(search.toString())}`}>{label}</a>;
}

/** Returns to the index with the visitor's search and filters. Exported HTML links to the unfiltered index. */
export function UseCaseReturn({ label = "← Back to use cases" }: { label?: ReactNode }) {
  return <Suspense fallback={<a href="/use-cases/">{label}</a>}><IndexReturn label={label} /></Suspense>;
}
