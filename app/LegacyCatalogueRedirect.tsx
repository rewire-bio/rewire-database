"use client";
import { useEffect, useState } from "react";
import { legacyCatalogueDestination } from "@/lib/omics-navigation";

/** Firebase issues the permanent redirect first. Keep static-export and client-navigation fallbacks. */
export default function LegacyCatalogueRedirect({
  target,
  label = "Open the benchmark database",
}: {
  target: string;
  label?: string;
}) {
  const [destination, setDestination] = useState(() =>
    legacyCatalogueDestination(target),
  );
  useEffect(() => {
    const resolved = legacyCatalogueDestination(
      target,
      window.location.search,
      window.location.hash,
    );
    setDestination(resolved);
    window.location.replace(resolved);
  }, [target]);
  return (
    <section className="block first">
      <div className="wrap prose-brief">
        <p>This content is now part of the benchmark database.</p>
        <p>
          <a href={destination}>{label} &rarr;</a>
        </p>
      </div>
    </section>
  );
}
