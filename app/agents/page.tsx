import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { Illustration } from "@/components/AgentBanner";
import CodeBlock from "@/components/agents/CodeBlock";
import SetupTabs from "@/components/agents/SetupTabs";
import { dataPin } from "@/lib/data-pin";
import {
  claudeMcpAdd, examplePrompts, kgArchiveUrl, mcpJson, pluginCommands, GRAPH_SERVER, KG_ALIAS, PLUGIN, SKILL_URL,
} from "@/lib/agent-connect";
import styles from "./agents.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect your agent | Benchmark database",
  description: "Set up Claude Code or another MCP client to query the benchmark database and reproduce benchmarks locally.",
};

const steps = [
  { title: "Install the plugin", text: "Two commands in Claude Code add a benchmark skill and a read-only server for the database's knowledge graph." },
  { title: "Ask about the evidence", text: "The agent finds models, benchmarks, published results and their sources, with review status and caveats." },
  { title: "Reproduce and compare", text: "It runs a benchmark with the rewirebench tool on your machine and sets your result beside the published one." },
];

const rules = [
  { title: "Runs on your machine", text: "Your model, weights and data are not sent to Rewire." },
  { title: "Nothing submitted for you", text: "Submitting a result to the database is a separate step that needs your explicit consent." },
  { title: "Checked monthly", text: "Each use case's evidence is re-checked against new publications every month." },
  { title: "Reproduce, don't assume", text: "A source-checked result is a reviewed transcription of a paper's number. Running it yourself is how you find out." },
];

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
      <section className={styles.hero} aria-labelledby="install-heading">
        <Illustration className={styles.heroArt} />
        <div className={styles.heroText}>
          <h2 id="install-heading">Install in Claude Code</h2>
          <p>The <code>{PLUGIN}</code> plugin. The server needs <a href="https://docs.astral.sh/uv/">uv</a>.</p>
        </div>
        <div className={styles.heroCode}><CodeBlock code={pluginCommands.join("\n")} /></div>
      </section>

      <section aria-labelledby="how-heading" className={styles.section}>
        <h2 id="how-heading">How it works</h2>
        <ol className={styles.steps}>
          {steps.map((step, i) => <li key={step.title}><span className={styles.stepNumber}>{i + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}
        </ol>
      </section>

      <section aria-labelledby="prompts-heading" className={styles.section}>
        <h2 id="prompts-heading">Try asking</h2>
        <ul className={styles.prompts}>
          {examplePrompts.map((prompt) => <li key={prompt}><CodeBlock code={prompt} prose /></li>)}
        </ul>
      </section>

      <section aria-labelledby="setup-heading" className={styles.section}>
        <h2 id="setup-heading">Other ways to connect</h2>
        <SetupTabs tabs={[
          { id: "graph", label: "Knowledge graph only", body: <>
            <p>Adds just the <code>{GRAPH_SERVER}</code> MCP server to Claude Code, without the skill.</p>
            <CodeBlock code={claudeMcpAdd()} />
          </> },
          { id: "other", label: "Other MCP clients", body: <>
            <p>Add this entry to the client&apos;s MCP configuration, then give the agent the <a href={SKILL_URL}>skill text</a> as instructions.</p>
            <CodeBlock code={mcpJson()} />
          </> },
          { id: "pin", label: "Pin a release", body: <>
            <p><code>{KG_ALIAS}</code> follows the release this site serves, so the server picks up new releases when it restarts. For an exact reproduction, pin release {releaseId}:</p>
            <CodeBlock code={claudeMcpAdd(kgArchiveUrl(releaseId))} />
            <p className={styles.muted}>The server checks every file against the bundle&apos;s manifest before loading it, and it is read-only.</p>
          </> },
        ]} />
      </section>

      <section aria-labelledby="rules-heading" className={styles.section}>
        <h2 id="rules-heading">What happens where</h2>
        <ul className={styles.rules}>
          {rules.map((rule) => <li key={rule.title}><h3>{rule.title}</h3><p>{rule.text}</p></li>)}
        </ul>
      </section>

      <p className={styles.footnote}>For agents reading this site: plain-text versions at <a href="/llms.txt">/llms.txt</a> and <a href="/agents.md">/agents.md</a>.</p>
    </div>
  </>;
}
