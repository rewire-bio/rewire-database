"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DOMAINS, MODELS, type DomainId } from "@/lib/benchmark-catalog";
import styles from "./overview.module.css";

export default function ModelIndex() {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const models = useMemo(() => MODELS.filter((model) => {
    if (domain && !model.domainIds.includes(domain as DomainId)) return false;
    return `${model.name} ${model.version} ${model.kind}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => a.name.localeCompare(b.name, "en")), [query, domain]);

  return <div>
    <div className={styles.modelControls}>
      <label><span>Find a model</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" /></label>
      <label><span>Domain</span><select value={domain} onChange={(event) => setDomain(event.target.value)}><option value="">All six domains</option>{DOMAINS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    </div>
    <p className={styles.modelCount} aria-live="polite">{models.length} candidate models and comparators</p>
    <ul className={styles.modelList}>
      {models.map((model) => <li key={model.id}>
        <Link href={`/${domain || model.domainIds[0]}/#model-${model.id}`}><strong>{model.name}</strong> <span>{model.version}</span></Link>
        <small>{model.kind}</small>
      </li>)}
    </ul>
    {models.length === 0 && <p>No models match this search.</p>}
  </div>;
}
