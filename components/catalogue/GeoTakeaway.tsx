import React from "react";
import styles from "./GeoTakeaway.module.css";
import type { GeoTakeawayData } from "../../lib/geo-takeaway";

export interface GeoTakeawayProps {
  data?: Partial<GeoTakeawayData>;
  title?: string;
  primaryStatement?: string;
  secondaryStatement?: string;
  className?: string;
  testId?: string;
  variant?: "banner" | "card" | "inline";
}

export function GeoTakeaway({
  data,
  title = data?.title || "Executive Takeaway",
  primaryStatement = data?.primaryStatement || "",
  secondaryStatement = data?.secondaryStatement,
  className = "",
  testId = "geo-takeaway",
  variant = "banner",
}: GeoTakeawayProps) {
  if (!primaryStatement) return null;

  return (
    <section
      className={`${styles.geoTakeaway} ${styles[variant]} ${className} geo-takeaway`}
      data-geo-takeaway="true"
      aria-label={title}
    >
      <div className={styles.header} data-testid={testId}>
        <span className={styles.icon} aria-hidden="true">💡</span>
        <strong className={styles.title}>{title}</strong>
      </div>
      <p className={styles.primaryStatement}>
        {primaryStatement}
      </p>
      {secondaryStatement && (
        <p className={styles.secondaryStatement}>
          {secondaryStatement}
        </p>
      )}
    </section>
  );
}

export default GeoTakeaway;
