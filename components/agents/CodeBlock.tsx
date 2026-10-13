"use client";
import { useState } from "react";
import styles from "@/app/agents/agents.module.css";

/** A dark code block with a copy button; long lines scroll inside the block, not the page. */
export default function CodeBlock({ code, label = "Copy", prose = false }: { code: string; label?: string; prose?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  }
  return (
    <div className={prose ? `${styles.code} ${styles.prose}` : styles.code}>
      <pre tabIndex={0}><code>{code}</code></pre>
      <button type="button" onClick={copy} aria-label={`${label}: ${code.split("\n")[0]}`}>{copied ? "Copied" : label}</button>
    </div>
  );
}
