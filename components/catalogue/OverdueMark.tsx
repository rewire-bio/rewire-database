"use client";
import { useEffect, useState } from "react";
import { overdue } from "@/lib/discrepancy-dates";
import styles from "./Contested.module.css";

/** Marks a follow-up whose next check date has passed. Pages are cached at the edge for days,
 * so the date is compared in the browser, never baked into the HTML. */
export default function OverdueMark({ nextCheck }: { nextCheck: string | null }) {
  const [late, setLate] = useState(false);
  useEffect(() => setLate(overdue(nextCheck, new Date())), [nextCheck]);
  return late ? <span className={styles.overdue}>Overdue</span> : null;
}
