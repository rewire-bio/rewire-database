import { pluginCommands, examplePrompts, PLUGIN } from "@/lib/agent-connect";
import styles from "@/app/database/database.module.css";

/** A short "connect your agent" box: the plugin install, with a link to the full setup page. */
export default function AgentConnect() {
  return (
    <section id="connect-agent" className={styles.information} aria-labelledby="connect-agent-heading">
      <h2 id="connect-agent-heading">Connect your agent</h2>
      <p>
        Give a coding agent such as Claude Code access to this database and to the benchmark runner.
        The <code>{PLUGIN}</code> plugin installs a skill that explains how to find, run and compare
        benchmarks, and an MCP server that queries the database&apos;s knowledge graph.
      </p>
      <pre><code>{pluginCommands.join("\n")}</code></pre>
      <p className={styles.muted}>
        Then ask, for example: &ldquo;{examplePrompts[1]}&rdquo; Runs happen on your machine, and nothing
        is submitted without your consent.
      </p>
      <p><a href="/agents/">Other agents, the knowledge graph only, and pinned releases →</a></p>
    </section>
  );
}
