import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { dataPin } from "@/lib/data-pin";
import {
  claudeMcpAdd, examplePrompts, kgArchiveUrl, mcpJson, pluginCommands, GRAPH_SERVER, KG_ALIAS, PLUGIN, SKILL_URL,
} from "@/lib/agent-connect";
import styles from "../database/database.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect your agent | Benchmark database",
  description: "Set up Claude Code or another MCP client to query the benchmark database and reproduce benchmarks locally.",
};

export default function AgentsPage() {
  const releaseId = dataPin().release_id;
  return <>
    <PageHeader
      breadcrumbs={[{ name: "Database", path: "/" }, { name: "Connect your agent", path: "/agents/" }]}
      eyebrow={["Agents", `Release ${releaseId}`]}
      title="Connect your agent"
      intro="Let a coding agent query the reviewed evidence and run the benchmarks on your machine, for example to check a published result against your own model or configuration."
    />
    <div className="wrap content">
      <section className={styles.information} aria-labelledby="plugin-heading">
        <h2 id="plugin-heading">Claude Code</h2>
        <p>
          The <code>{PLUGIN}</code> plugin adds two things: a skill that explains how to find a benchmark, run it
          with the <code>rewirebench</code> command-line tool and compare the result with the published values, and
          the <code>{GRAPH_SERVER}</code> MCP server, which answers questions from the database&apos;s knowledge graph.
          The server needs <a href="https://docs.astral.sh/uv/">uv</a>.
        </p>
        <pre><code>{pluginCommands.join("\n")}</code></pre>
        <p>To add only the knowledge graph:</p>
        <pre><code>{claudeMcpAdd()}</code></pre>
      </section>
      <section className={styles.information} aria-labelledby="other-heading">
        <h2 id="other-heading">Other MCP clients</h2>
        <p>Add this server entry to the client&apos;s MCP configuration, and give the agent the <a href={SKILL_URL}>skill text</a> as instructions.</p>
        <pre><code>{mcpJson()}</code></pre>
      </section>
      <section className={styles.information} aria-labelledby="release-heading">
        <h2 id="release-heading">Which release the agent sees</h2>
        <p>
          <code>{KG_ALIAS}</code> always points to the release this site serves, so a new release is picked up the next
          time the server starts. To pin one release for an exact reproduction, use its bundle instead:
        </p>
        <pre><code>{claudeMcpAdd(kgArchiveUrl(releaseId))}</code></pre>
        <p className={styles.muted}>The server checks every file against the bundle&apos;s manifest before loading it, and it is read-only.</p>
      </section>
      <section className={styles.information} aria-labelledby="prompts-heading">
        <h2 id="prompts-heading">What to ask</h2>
        <ul>{examplePrompts.map((prompt) => <li key={prompt}>&ldquo;{prompt}&rdquo;</li>)}</ul>
      </section>
      <section className={styles.information} aria-labelledby="rules-heading">
        <h2 id="rules-heading">What happens where</h2>
        <ul>
          <li>Benchmarks run on your machine. Your model, weights and data are not sent to Rewire.</li>
          <li>Nothing is submitted to the database without your explicit consent; submission is a separate, manual step.</li>
          <li>The evidence for each use case is re-checked against new publications every month. Each release says when.</li>
          <li>A published result marked source-checked is a reviewed transcription of a paper&apos;s number, not an independent reproduction. Running it yourself is how you find out.</li>
        </ul>
        <p>Plain-text versions of this page for agents: <a href="/llms.txt">/llms.txt</a> and <a href="/agents.md">/agents.md</a>.</p>
      </section>
    </div>
  </>;
}
