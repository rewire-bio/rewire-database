"use client";
import { usePathname } from "next/navigation";
import { pluginCommands, PLUGIN } from "@/lib/agent-connect";
import styles from "./AgentConnectStrip.module.css";

/** The browse pages where people start; the home page has the full box, and record pages with a
 * run recipe have their own "Reproduce with your agent" prompt. */
export const AGENT_STRIP_PATHS = ["/use-cases/", "/benchmarks/", "/models/", "/evidence/"];

/** A compact "connect your agent" box at the foot of the browse pages. */
export default function AgentConnectStrip() {
  const pathname = usePathname() || "/";
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (!AGENT_STRIP_PATHS.includes(path)) return null;
  return (
    <aside className={styles.strip} aria-labelledby="agent-strip-heading">
      <div className={`wrap ${styles.inner}`}>
        <div className={styles.text}>
          <h2 id="agent-strip-heading">Connect your agent</h2>
          <p>
            Let Claude Code or another coding agent query this database and run the benchmarks on your machine.
            Install the <code>{PLUGIN}</code> plugin:
          </p>
        </div>
        <pre className={styles.code}><code>{pluginCommands.join("\n")}</code></pre>
        <a className={styles.link} href="/agents/">Other agents and pinned releases →</a>
      </div>
    </aside>
  );
}
