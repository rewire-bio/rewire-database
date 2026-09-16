"use client";
import { createTRPCUntypedClient, httpLink } from "@trpc/client";
import type { createCatalogueQuery } from "../services/omics/src/catalogue-query";

type Query = ReturnType<typeof createCatalogueQuery>;
export type CatalogueRelease = ReturnType<Query["release"]>;
export type CataloguePage = ReturnType<Query["list"]>;
export type CatalogueDetail = NonNullable<ReturnType<Query["get"]>>;
export type ResultsPage = ReturnType<Query["results"]>;
export type Comparison = ReturnType<Query["compare"]>;

/** Browser traffic always pins one release. Never send contributor credentials. */
export function catalogueClient(releaseId: string) {
  const transport = createTRPCUntypedClient({
    links: [httpLink({ url: "/api/trpc" })],
  });
  async function read<T>(procedure: string, input: object): Promise<T> {
    const value = await transport.query(`catalogue.${procedure}`, {
      ...input,
      release_id: releaseId,
    });
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
    list: (input: Parameters<Query["list"]>[0]) =>
      read<CataloguePage>("list", input || {}),
    get: (input: Parameters<Query["get"]>[0]) =>
      read<CatalogueDetail | null>("get", input),
    results: (input: Parameters<Query["results"]>[0]) =>
      read<ResultsPage>("results", input),
    compare: (input: Parameters<Query["compare"]>[0]) =>
      read<Comparison>("compare", input),
  };
}
