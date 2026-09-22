"use client";
import { useEffect, useState } from "react";

/** Namespaced location state leaves explorer filters and historical fragments intact. */
export function useResultsLocation<T extends Record<string, string>>(
  defaults: T,
) {
  const [state, setState] = useState<T>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setState(
        Object.fromEntries(
          Object.entries(defaults).map(([key, value]) => [
            key,
            params.get(`results_${key}`) ?? value,
          ]),
        ) as T,
      );
      setReady(true);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
    // Callers provide a stable constant default object.
  }, [defaults]);
  function update(patch: Partial<T>) {
    const next = { ...state, ...patch };
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== defaults[key])
        url.searchParams.set(`results_${key}`, value);
      else url.searchParams.delete(`results_${key}`);
    }
    window.history.pushState(null, "", url);
    setState(next);
  }
  return { state, update, ready };
}
