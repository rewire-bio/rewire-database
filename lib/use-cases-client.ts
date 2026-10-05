"use client";

import { createTRPCUntypedClient, httpLink } from "@trpc/client";
import type { createUseCaseQuery } from "../services/omics/src/use-cases";

type Query = ReturnType<typeof createUseCaseQuery>;
export type UseCasePage = ReturnType<Query["list"]>;
export type UseCaseDetail = NonNullable<ReturnType<Query["get"]>>;
export type UseCaseEvaluationResults = ReturnType<Query["evaluationResults"]>;
export type UseCaseLinks = ReturnType<Query["links"]>;
export type UseCaseFilters = {
  q: string;
  area: string;
  context: "" | "research" | "clinical_research";
};
export const emptyUseCaseFilters: UseCaseFilters = { q: "", area: "", context: "" };
export const USE_CASE_PAGE_SIZE = 10;

export function readUseCaseFilters(search: string): UseCaseFilters {
  const params = new URLSearchParams(search);
  const context = params.get("context");
  return {
    q: (params.get("q") || "").slice(0, 200),
    area: (params.get("area") || "").slice(0, 100),
    context: context === "research" || context === "clinical_research" ? context : "",
  };
}

export function encodeUseCaseSearch(filters: UseCaseFilters, cursor?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return params.size ? `?${params}` : "";
}

export function caseContextLabel(context: string): string {
  return context === "clinical_research" ? "Clinical research" : "Research";
}

/** Every request pins both the release and the reviewed use-case input digest. */
export function createUseCasesClient(releaseId: string, inputSha256: string | null) {
  const transport = createTRPCUntypedClient({ links: [httpLink({ url: "/api/trpc" })] });
  async function read<T>(procedure: string, input: object, signal?: AbortSignal): Promise<T> {
    const value = await transport.query(`catalogue.${procedure}`, { ...input, release_id: releaseId }, { signal });
    if (value === null && procedure !== "useCase") throw new Error("The use-case collection is unavailable. Please retry.");
    if (value !== null && (typeof value !== "object" || !("release_id" in value) || value.release_id !== releaseId || !("input_sha256" in value) || value.input_sha256 !== inputSha256)) {
      throw new Error("Use-case evidence changed. Reload this page to use one consistent release.");
    }
    return value as T;
  }
  return {
    list: (input: Parameters<Query["list"]>[0], signal?: AbortSignal) => read<UseCasePage>("useCases", input || {}, signal),
    get: (input: { slug: string; cursor?: string; limit?: number }, signal?: AbortSignal) => read<UseCaseDetail | null>("useCase", input, signal),
    evaluationResults: (input: { mapping_id: string; evaluation_id: string; cursor?: string; limit?: number }, signal?: AbortSignal) =>
      read<UseCaseEvaluationResults>("useCaseEvaluationResults", input, signal),
    links: (input: { id: string }, signal?: AbortSignal) => read<UseCaseLinks>("useCaseLinks", input, signal),
  };
}
