"use client";
import { createTRPCUntypedClient, httpLink } from "@trpc/client";
import type { createCatalogueQuery } from "../shared/omics/catalogue-query";

type Query = ReturnType<typeof createCatalogueQuery>;
export type CatalogueRelease = ReturnType<Query["release"]>;
export type CataloguePage = ReturnType<Query["list"]>;
export type CatalogueDetail = NonNullable<ReturnType<Query["get"]>>;
export type ResultsPage = ReturnType<Query["results"]>;
export type EvidencePage = ReturnType<Query["evidence"]>;
export type Comparison = ReturnType<Query["compare"]>;

/** Browser traffic always pins one release. Never send contributor credentials. */
export function catalogueClient(releaseId: string) {
  const transport = createTRPCUntypedClient({
    links: [httpLink({ url: "/api/trpc" })],
  });
  async function read<T>(
    procedure: string,
    input: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const value = await transport.query(
      `catalogue.${procedure}`,
      {
        ...input,
        release_id: releaseId,
      },
      { signal },
    );
    if (
      value !== null &&
      (typeof value !== "object" ||
        !("release_id" in value) ||
        value.release_id !== releaseId)
    ) {
      throw new Error(
        "The response belongs to a different catalogue release. Reload this page.",
      );
    }
    return value as T;
  }
  return {
    list: (input: Parameters<Query["list"]>[0], signal?: AbortSignal) =>
      read<CataloguePage>("list", input || {}, signal),
    get: (input: { id: string }) => read<CatalogueDetail | null>("get", input),
    comparison: (input: Parameters<Query["comparison"]>[0]) =>
      read<ReturnType<Query["comparison"]>>("comparison", input),
    results: (input: Parameters<Query["results"]>[0]) =>
      read<ResultsPage>("results", input),
    evidence: (input: Parameters<Query["evidence"]>[0]) =>
      read<EvidencePage>("evidence", input),
    compare: (input: Parameters<Query["compare"]>[0]) =>
      read<Comparison>("compare", input),
  };
}
