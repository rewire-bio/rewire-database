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

function IndexReturn() {
  const search = useSearchParams();
  return <a href={`/use-cases/${contextSearch(search.toString())}`}>← Back to use cases</a>;
}

export function UseCaseReturn() {
  return <Suspense fallback={<a href="/use-cases/">← Back to use cases</a>}><IndexReturn /></Suspense>;
}
