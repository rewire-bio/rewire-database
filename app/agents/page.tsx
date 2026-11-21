import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { Illustration } from "@/components/AgentBanner";
import CodeBlock from "@/components/agents/CodeBlock";
import SetupTabs from "@/components/agents/SetupTabs";
import { socialMetadata } from "@/lib/catalogue-sharing";
import { dataPin } from "@/lib/data-pin";
import {
  claudeMcpAdd, discrepancyApi, discrepancyQueries, examplePrompts, kgArchiveUrl, mcpJson, pluginCommands, GRAPH_SERVER, KG_ALIAS, PLUGIN, SKILL_URL,
} from "@/lib/agent-connect";
import styles from "./agents.module.css";

export const dynamic = "force-dynamic";

const pageMetadata = {
  title: "Connect your agent | Benchmark database",
  description: "Set up Claude Code or another MCP client to query the benchmark database and run benchmarks locally on CPU.",
  alternates: { canonical: "https://benchmarks.rewirebio.io/agents/" },
};
export const metadata: Metadata = {
  ...pageMetadata,
  ...socialMetadata({
    title: pageMetadata.title,
    description: pageMetadata.description,
    path: pageMetadata.alternates.canonical,
  }),
};

const steps = [
  { title: "Install the plugin", text: "Two commands in Claude Code add three MCP servers (the knowledge graph, genomic data and the rewirebench runner), five skills, six commands and a benchmarking agent." },
  { title: "Ask about the evidence", text: "The agent finds models, benchmarks, published results and their sources, with review status and caveats." },
  { title: "Rerun and compare", text: "It plans and runs a benchmark recipe on your machine, on CPU, and sets the run beside the published value. The recipe that ships today reruns Rewire's own MFASS v2 baseline." },
];

const rules = [
  { title: "Runs on your machine", text: "Runs use your CPU. Your model, weights and data are not sent to Rewire, and the plugin starts no GPU or paid run." },
  { title: "Nothing is submitted", text: "No tool in the plugin submits a result to the database. A run ends with a receipt folder and a comparison on your machine." },
  { title: "Checked monthly", text: "Each use case's evidence is re-checked against new publications every month." },
  { title: "A rerun is not a reproduction", text: "A source-checked result is a reviewed transcription of a published number. Rerunning it with the publisher's code and data shows the number can be regenerated. It is not an independent reproduction." },
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
      <div className={styles.hero} role="region" aria-labelledby="install-heading">
        <Illustration className={styles.heroArt} />
        <div className={styles.heroText}>
          <h2 id="install-heading">Install in Claude Code</h2>
          <p>The <code>{PLUGIN}</code> plugin. Its servers need <a href="https://docs.astral.sh/uv/">uv</a>.</p>
        </div>
        <div className={styles.heroCode}><CodeBlock code={pluginCommands.join("\n")} /></div>
      </div>

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
            <p>Adds just the <code>{GRAPH_SERVER}</code> MCP server to Claude Code, without the skills, the commands or the other two servers.</p>
            <CodeBlock code={claudeMcpAdd()} />
          </> },
          { id: "other", label: "Other MCP clients", body: <>
            <p>Add this entry to the client&apos;s MCP configuration, then give the agent the <a href={SKILL_URL}>skill texts</a> as instructions.</p>
            <CodeBlock code={mcpJson()} />
          </> },
          { id: "pin", label: "Pin a release", body: <>
            <p><code>{KG_ALIAS}</code> follows the release this site serves, so the server picks up new releases when it restarts. To keep to one release, pin release {releaseId}:</p>
            <CodeBlock code={claudeMcpAdd(kgArchiveUrl(releaseId))} />
            <p className={styles.muted}>The server checks every file against the bundle&apos;s manifest before loading it, and it is read-only.</p>
          </> },
        ]} />
      </section>

      <section aria-labelledby="contested-heading" className={styles.section}>
        <h2 id="contested-heading">Contested results</h2>
        <p>Each release flags studies that disagree with what other studies report for the same models, and records what we are doing to resolve each case. The findings are leads, not findings of error, and never withhold a result. People read them at <a href="/contested/">contested results</a>; agents can read the same findings two ways.</p>
        <h3>Public API</h3>
        <ul>
          {discrepancyApi.map((p) => <li key={p.name}><code>{p.name}</code>: {p.input}. Returns {p.returns}.</li>)}
        </ul>
        <h3>Knowledge graph</h3>
        <p>The bundle&apos;s derived graph holds the same findings. The MCP server&apos;s <code>list_queries</code> and <code>run_query</code> tools offer these named queries:</p>
        <ul>
          {discrepancyQueries.map((q) => <li key={q.name}><code>{q.name}</code> ({q.params}): {q.returns}.</li>)}
        </ul>
      </section>

      <section aria-labelledby="rules-heading" className={styles.section}>
        <h2 id="rules-heading">What happens where</h2>
        <ul className={styles.rules}>
          {rules.map((rule) => <li key={rule.title}><h3>{rule.title}</h3><p>{rule.text}</p></li>)}
        </ul>
      </section>

      <p className={styles.footnote}>For agents reading this site: plain-text versions at <a href="/llms.txt">/llms.txt</a> and <a href="/agents.md">/agents.md</a>. The release is also served as JSON, with no key: see the <a href="/agents/api/">JSON API</a>.</p>
    </div>
  </>;
}
