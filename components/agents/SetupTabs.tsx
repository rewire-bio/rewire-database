"use client";
import { useState, type ReactNode } from "react";
import styles from "@/app/agents/agents.module.css";

/** Setup options as tabs. Every panel is rendered, so the page reads fully without JavaScript. */
export default function SetupTabs({ tabs }: { tabs: { id: string; label: string; body: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label="Setup options" className={styles.tablist}>
        {tabs.map((tab) => (
          <button key={tab.id} role="tab" type="button" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`}
            aria-selected={active === tab.id} className={active === tab.id ? styles.tabActive : styles.tab}
            onClick={() => setActive(tab.id)}>{tab.label}</button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id} className={styles.panel}>{tab.body}</div>
      ))}
    </div>
  );
}
