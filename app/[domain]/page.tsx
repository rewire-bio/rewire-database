import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CATALOG_SOURCE_CHECKED,
  DOMAINS,
  getDomain,
  getDomainModels,
  getDomainTests,
  getModelMatches,
  getTest,
  getTestMatches,
  getModel,
  type DomainId,
} from "@/lib/benchmark-catalog";
import styles from "./catalog.module.css";

type Props = { params: { domain: string } };

export function generateStaticParams() {
  return DOMAINS.map(({ id }) => ({ domain: id }));
}

export function generateMetadata({ params }: Props): Metadata {
  const domain = getDomain(params.domain);
  if (!domain) return { title: "Benchmark domain | rewire.it" };
  return {
    title: `${domain.name} models and tests | rewire.it`,
    description: `Biological models and applicable benchmark tests for ${domain.name}, with candidate tests distinguished from measured rewire.it runs.`,
    alternates: { canonical: `https://benchmarks.rewire.it/${domain.id}/` },
  };
}

export default function BenchmarkDomainPage({ params }: Props) {
  const domain = getDomain(params.domain);
  if (!domain) notFound();
  const models = getDomainModels(domain.id as DomainId);
  const tests = getDomainTests(domain.id as DomainId);

  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <Link className={styles.breadcrumb} href="/">← All benchmarks</Link>
          <span className="kick">Model and test catalog</span>
          <h1>{domain.name}</h1>
          <p className={`intro ${styles.intro}`}>{domain.note} Explore models, applicable tests and evaluation requirements.</p>
        </div>
      </header>

      <section className="block first">
        <div className="wrap">
          <h2 className="sec-head">Models to test</h2>
          <p className={styles.explain}>
            These are candidates, not a ranked list. An applicable test may need a trained head,
            a scoring adapter, a specialist comparison, or access to a hosted service.
            No result is implied by appearing here.
          </p>
          <ul className={styles.legend} aria-label="How models can be used in a test">
            <li>Native prediction</li>
            <li>Frozen embedding + trained head</li>
            <li>Specialist / baseline</li>
            <li>Adapter required</li>
            <li>Conditional access</li>
          </ul>
          <div className={styles.grid}>
            {models.map((model) => {
              const matches = getModelMatches(model.id).filter((match) => tests.some((test) => test.id === match.testId));
              return (
                <article className={styles.card} id={`model-${model.id}`} key={model.id}>
                  <h3>{model.name}</h3>
                  <div className={styles.meta}><span>{model.version}</span><span aria-hidden="true">·</span><span>{model.kind}</span></div>
                  <p>{model.access}</p>
                  <a className={styles.source} href={model.sourceUrl} target="_blank" rel="noopener noreferrer">Official source ↗</a>
                  <Link className={styles.paperLink} href={`/literature/?q=${encodeURIComponent(model.name)}`}>
                    Paper-reported results →
                  </Link>
                  <div className={styles.matches}>
                    <h4>Applicable tests</h4>
                    {matches.map((match) => {
                      const test = getTest(match.testId)!;
                      return (
                        <div className={styles.match} key={match.testId}>
                          <a className={styles.jump} href={`#test-${test.id}`}>{test.name}</a>
                          <div><span className={styles.pill}>{match.mode}</span></div>
                          <p>{match.note}</p>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <h2 className="sec-head">Test families</h2>
          <p className={styles.explain}>Each candidate test needs a defined dataset, split, metric and run protocol before it can become a benchmark.</p>
          <div className={styles.grid}>
            {tests.map((test) => (
              <article className={styles.card} id={`test-${test.id}`} key={test.id}>
                <h3>{test.name}</h3>
                <span className={`${styles.pill} ${test.status !== "candidate" ? styles.status : ""}`}>
                  {test.status === "candidate" ? "Candidate test" : "Measured rewire.it run"}
                </span>
                <p>{test.note}</p>
                {test.id === "mfass-splice" && (
                  <Link className={styles.source} href="/runs/mfass-v2/">Read the corrected MFASS v2 result →</Link>
                )}
                <div className={styles.matches}>
                  <h4>Candidate models and comparators</h4>
                  {getTestMatches(test.id).map((match) => {
                    const model = getModel(match.modelId)!;
                    return (
                      <div className={styles.match} key={match.modelId}>
                        {model.domainIds.includes(domain.id) ? (
                          <a className={styles.jump} href={`#model-${model.id}`}>{model.name}</a>
                        ) : (
                          <Link className={styles.jump} href={`/${model.domainIds[0]}/#model-${model.id}`}>{model.name}</Link>
                        )}
                        <div><span className={styles.pill}>{match.mode}</span></div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
          <p className={styles.footnote}>Model sources and access descriptions checked {CATALOG_SOURCE_CHECKED}. Confirm licenses, terms and checkpoint revisions before any run.</p>
        </div>
      </section>
    </>
  );
}
