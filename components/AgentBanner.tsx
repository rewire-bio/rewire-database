"use client";
import { useState } from "react";
import { pluginCommands } from "@/lib/agent-connect";
import styles from "./AgentBanner.module.css";

/** A terminal connected to a small graph: an agent querying the knowledge graph. */
function Illustration() {
  return (
    <svg className={styles.art} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="10" width="34" height="26" rx="5" className={styles.window} />
      <rect x="2" y="10" width="34" height="7" rx="5" className={styles.bar} />
      <circle cx="7.5" cy="13.5" r="1.3" className={styles.dot} />
      <circle cx="11.5" cy="13.5" r="1.3" className={styles.dot} />
      <path d="M8 23 l4 3 -4 3" className={styles.prompt} />
      <path d="M15 29 h9" className={styles.prompt} />
      <path d="M36 23 C44 23 44 16 50 16 M36 23 C44 23 44 34 50 40 M50 16 L58 28 L50 40 M50 16 L50 40" className={styles.edge} />
      <circle cx="50" cy="16" r="4" className={styles.node} />
      <circle cx="58" cy="28" r="3.5" className={styles.nodeSoft} />
      <circle cx="50" cy="40" r="4" className={styles.node} />
      <circle cx="30" cy="50" r="3" className={styles.nodeSoft} />
      <path d="M50 40 C44 48 38 50 30 50" className={styles.edge} />
    </svg>
  );
}

/** A compact, coloured "connect your agent" banner: the plugin install with a copy button. */
export default function AgentBanner() {
  const [copied, setCopied] = useState(false);
  const commands = pluginCommands.join("\n");
  async function copy() {
    try { await navigator.clipboard.writeText(commands); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  }
  return (
    <aside className={styles.banner} aria-labelledby="agent-banner-heading">
      <Illustration />
      <div className={styles.text}>
        <h2 id="agent-banner-heading">Connect your agent</h2>
        <p>Query this database and rerun benchmarks locally from Claude Code or any MCP client.</p>
      </div>
      <div className={styles.command}>
        <pre><code>{commands}</code></pre>
        <button type="button" onClick={copy} aria-label="Copy the install commands">{copied ? "Copied" : "Copy"}</button>
      </div>
      <a className={styles.link} href="/agents/">Setup →</a>
    </aside>
  );
}
