"use client";
import { useEffect, useMemo, useState } from "react";
import {
  catalogueClient,
  type CataloguePage,
  type CatalogueRelease,
  type Comparison,
} from "@/lib/catalogue-client";
import {
  defaultFilters,
  readCatalogueFilters,
  primaryKinds,
  catalogueSearch,
  BROWSE_PAGE_SIZE,
  type CatalogueFilters,
} from "@/lib/omics-browse";
import { researchKinds } from "@/components/catalogue/ResearchLabels";

export function useCatalogueExplorer(
  initial: CataloguePage,
  release: CatalogueRelease,
  deferInitialResults = false,
) {
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState(initial);
  const [cursor, setCursor] = useState<string | undefined>();
  const [applied, setApplied] = useState({
    filters: defaultFilters,
    cursor: undefined as string | undefined,
  });
  const [ready, setReady] = useState(false);
  const [browsing, setBrowsing] = useState(!deferInitialResults);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const client = useMemo(
    () => catalogueClient(release.release_id),
    [release.release_id],
  );
  useEffect(() => {
    const read = () => {
      const next = readCatalogueFilters(window.location.search);
      const hasQueryOrHash =
        Boolean(window.location.search) || window.location.hash === "#browse";
      setFilters(next);
      setCursor(
        new URLSearchParams(window.location.search).get("cursor") || undefined,
      );
      setBrowsing(!deferInitialResults || hasQueryOrHash);
      if (!primaryKinds.some((kind) => kind === next.kind)) setMoreOpen(true);
      setSelected([]);
      setReady(true);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [deferInitialResults]);
  useEffect(() => {
    if (!ready || !browsing) return;
    let active = true;
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      deadline = setTimeout(() => {
        if (!active) return;
        active = false;
        controller.abort();
        setError("Loading these records took too long. Please retry.");
        setLoading(false);
      }, 15_000);
      client
        .list(
          {
            ...filters,
            q: filters.q || undefined,
            area: filters.area || undefined,
            status: filters.status || undefined,
            origin: filters.origin || undefined,
            readiness: filters.readiness || undefined,
            cursor,
            limit: BROWSE_PAGE_SIZE,
          },
          controller.signal,
        )
        .then((page) => {
          if (active) {
            setData(page);
            setApplied({ filters, cursor });
          }
        })
        .catch(() => {
          if (active)
            setError(
              "The catalogue service is unavailable. The requested records could not be loaded. Please retry.",
            );
        })
        .finally(() => {
          clearTimeout(deadline);
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [client, filters, cursor, retry, ready, browsing]);
  useEffect(() => {
    let active = true;
    setComparison(null);
    if (selected.length >= 2)
      client
        .compare({ ids: selected })
        .then((result) => {
          if (active) setComparison(result);
        })
        .catch(() => {
          if (active)
            setComparison({
              release_id: release.release_id,
              compatible: false,
              reasons: [
                "Compatibility service unavailable. No comparison has been established.",
              ],
            });
        });
    return () => {
      active = false;
    };
  }, [selected, client, release.release_id]);
  const resetToHome = () => {
    setFilters(defaultFilters);
    setCursor(undefined);
    setSelected([]);
    setBrowsing(false);
    window.history.pushState(null, "", window.location.pathname);
  };
  const navigate = (
    next: CatalogueFilters,
    nextCursor?: string,
    replace = false,
  ) => {
    const shouldReplace = replace && browsing;
    setFilters(next);
    setCursor(nextCursor);
    setSelected([]);
    setBrowsing(true);
    if (!primaryKinds.some((kind) => kind === next.kind)) setMoreOpen(true);
    const url = `${window.location.pathname}${catalogueSearch(next, nextCursor)}#browse`;
    window.history[shouldReplace ? "replaceState" : "pushState"](null, "", url);
  };
  const change = (key: keyof CatalogueFilters, value: string) => {
    const next = { ...filters, [key]: value };
    if (key === "kind" && !researchKinds.includes(value)) next.readiness = "";
    if (
      deferInitialResults &&
      key === "q" &&
      !value &&
      next.kind === defaultFilters.kind &&
      !next.area &&
      !next.status &&
      !next.origin &&
      !next.readiness
    ) {
      resetToHome();
      return;
    }
    navigate(next, undefined, key === "q");
  };
  // Controls reflect the requested URL immediately; rows belong to the last
  // successful request. Never display that page under different filters.
  const showResults =
    catalogueSearch(filters, cursor) ===
    catalogueSearch(applied.filters, applied.cursor);
  const busy = loading || (!showResults && !error);
  const returnTo = `/${catalogueSearch(applied.filters, applied.cursor)}#browse`;
  return {
    filters,
    data,
    applied,
    browsing,
    moreOpen,
    setMoreOpen,
    selected,
    setSelected,
    comparison,
    error,
    loading,
    busy,
    showResults,
    returnTo,
    navigate,
    change,
    resetToHome,
    retry: () => setRetry((attempt) => attempt + 1),
  };
}

export type ExplorerState = ReturnType<typeof useCatalogueExplorer>;
