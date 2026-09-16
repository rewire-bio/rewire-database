import type { Metadata } from "next";
import Link from "next/link";
import { DOMAINS, MODELS, TESTS } from "@/lib/benchmark-catalog";
import { getLiterature } from "@/lib/benchmark-literature";
import ModelIndex from "./ModelIndex";
import styles from "./overview.module.css";

export const metadata: Metadata = {
  title: "Benchmarks | rewire.it",
  description:
    "Browse biological foundation models, candidate tests, source-linked results reported in papers, and separate rewire.it benchmark runs.",
  alternates: { canonical: "https://benchmarks.rewire.it/" },
};

const REPO = "https://github.com/rewire-bio/rewire-benchmarks";

export default function BenchmarksPage() {
  const literature = getLiterature();
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">Open source</span>
          <h1>Benchmarks</h1>
          <p className="intro">
            A map of biological models and the tests that fit them, alongside independently measured
            rewire.it results and a separate collection of scores reported in research papers.
          </p>
        </div>
      </header>

      <section className={styles.section}>
        <div className="wrap">
          <h2>Explore by biology</h2>
          <p>Browse models and evaluation tasks by area of biology.</p>
          <div className={styles.domainGrid}>
            {DOMAINS.map((domain) => <article className={styles.domainCard} key={domain.id}>
              <h3>{domain.name}</h3>
              <p>{domain.note}</p>
              <span>{MODELS.filter((model) => model.domainIds.includes(domain.id)).length} models · {TESTS.filter((test) => test.domainId === domain.id).length} test families</span>
              <Link href={`/${domain.id}/`}>Browse models and tests &rarr;</Link>
            </article>)}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="wrap">
          <h2>Find a model</h2>
          <p>Find a model, explore the tests that apply to it and see what each evaluation requires.</p>
          <ModelIndex />
        </div>
      </section>

      <section className={styles.section}>
        <div className="wrap">
          <div className={styles.literatureCta}>
            <div><h2>Results reported in papers</h2><p>Results from {literature.papers.length} papers, with datasets, evaluation methods and links to the source.</p></div>
            <Link href="/literature/">Explore literature &rarr;</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="wrap">
          <div className={styles.literatureCta}>
            <div><h2>Our measured runs</h2><p>See how DNABERT-2 and specialist splicing tools compare with a simple baseline on MFASS.</p></div>
            <Link href="/runs/mfass-v2/">Read the corrected result &rarr;</Link>
          </div>
        </div>
      </section>

      <section className="block first">
        <div className="wrap prose-brief">
          <p>
            For rewire.it runs, the aim is to publish a floor that anyone can measure against
            and re-run. These six requirements guide each independent result and its published
            protocol.
          </p>
          <ol>
            <li>
              <strong>A trivial baseline always runs</strong>, with a fair tuning budget. A
              leaderboard without a floor is misleading, and in this field the floor frequently wins.
            </li>
            <li>
              <strong>The grouping rule and the independent-group count are published</strong> with
              every result. Splits leak in ways that never show up in the output file.
            </li>
            <li>
              <strong>Contamination is stated</strong> for every pretrained method: what was checked,
              and what is unknown. &ldquo;Unknown&rdquo; is an acceptable answer. Silence is not.
            </li>
            <li>
              <strong>Coverage reconciles against the original denominator.</strong> A method that
              cannot score an input has a coverage problem, not a negative prediction.
            </li>
            <li>
              <strong>Throughput sits beside accuracy</strong>, measured end to end.
            </li>
            <li>
              <strong>Configuration is recorded</strong>: checkpoint revision, pooling, context in
              bases and tokens, precision, batch size.
            </li>
          </ol>
        </div>
      </section>

      <section className={`block ${styles.historical}`} id="mfass-v1">
        <div className="wrap prose-brief">
          <h2 className="sec-head">mfass-v1 · historical report</h2>
          <div className={styles.correction}>
            <strong>Superseded by MFASS v2.</strong> The original baseline centred sequence windows incorrectly
            for 7,770 eligible variants. Its score and comparisons below are the preserved v1 record,
            not current evidence for choosing a model. <Link href="/runs/mfass-v2/">Read the corrected v2 result &rarr;</Link>
          </div>
          <p>
            <strong>Splice-variant prioritisation against a functional assay.</strong> Does a model
            improve the ranking of splice-region variants over the tools a diagnostic laboratory
            already runs?
          </p>
          <p>
            Built on MFASS, from{" "}
            <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6599603/">
              Chong and colleagues, <em>Molecular Cell</em> 2018
            </a>
            : 27,733 ExAC variants assayed for exon recognition in a minigene reporter, with 1,050
            splice-disrupting at 3.8% prevalence. The labels come from a functional assay rather
            than clinical assertions. About 17% of the disrupting variants sit at canonical splice
            sites.
          </p>

          <h3>Results</h3>
          <p>
            Held-out set of 8,324 variants across 463 independent groups, grouped by connected exon
            and gene components. Primary metric is precision at a 100-variant review capacity.
          </p>
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Family</th>
                <th>P@100</th>
                <th>AP</th>
                <th>AUROC</th>
                <th>Coverage</th>
                <th>s/variant</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>baseline-kmer-position</td>
                <td>trivial baseline</td>
                <td>0.620</td>
                <td>0.286</td>
                <td>0.768</td>
                <td>8324/8324</td>
                <td>0.00002</td>
              </tr>
              <tr>
                <td>spliceai-1.3.1</td>
                <td>specialist</td>
                <td>0.640</td>
                <td>0.299</td>
                <td>0.806</td>
                <td>8194/8324</td>
                <td>0.54</td>
              </tr>
              <tr>
                <td>pangolin (mask=False)</td>
                <td>specialist</td>
                <td>0.650</td>
                <td>0.389</td>
                <td>0.876</td>
                <td>8301/8324</td>
                <td>1.64</td>
              </tr>
            </tbody>
          </table>

          <h3>Paired comparisons</h3>
          <p>
            Observed difference on the variants both methods scored, with a 95% interval from
            resampling whole groups. Bold means the interval excludes zero.
          </p>
          <table>
            <thead>
              <tr>
                <th>Candidate minus reference</th>
                <th>P@100</th>
                <th>AP</th>
                <th>AUROC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>SpliceAI minus baseline</td>
                <td>+0.020 [&minus;0.090, +0.105]</td>
                <td>+0.009 [&minus;0.040, +0.056]</td>
                <td>
                  <strong>+0.037 [+0.002, +0.075]</strong>
                </td>
              </tr>
              <tr>
                <td>Pangolin minus baseline</td>
                <td>+0.030 [&minus;0.054, +0.102]</td>
                <td>
                  <strong>+0.102 [+0.061, +0.138]</strong>
                </td>
                <td>
                  <strong>+0.108 [+0.081, +0.134]</strong>
                </td>
              </tr>
              <tr>
                <td>Pangolin minus SpliceAI</td>
                <td>+0.010 [&minus;0.039, +0.076]</td>
                <td>
                  <strong>+0.092 [+0.061, +0.122]</strong>
                </td>
                <td>
                  <strong>+0.070 [+0.043, +0.094]</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            <strong>Original v1 interpretation, superseded by the corrected v2 result:</strong>{" "}
            Across the scored variants, Pangolin leads on AUROC, followed by SpliceAI and the
            baseline. Among the first hundred variants an analyst would actually review, the three
            put 62, 64 and 65 confirmed disruptions in the queue and cannot be told apart.
          </p>

          <h3>By distance to the exon boundary</h3>
          <p>AUROC on the 8,194 variants all three methods scored.</p>
          <table>
            <thead>
              <tr>
                <th>Band</th>
                <th>Variants</th>
                <th>SDVs</th>
                <th>baseline</th>
                <th>SpliceAI</th>
                <th>Pangolin</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>canonical, 0 to 2</td>
                <td>443</td>
                <td>41</td>
                <td>0.825</td>
                <td>0.902</td>
                <td>0.925</td>
              </tr>
              <tr>
                <td>near, 3 to 10</td>
                <td>1,671</td>
                <td>77</td>
                <td>0.745</td>
                <td>0.798</td>
                <td>0.857</td>
              </tr>
              <tr>
                <td>mid, 11 to 30</td>
                <td>4,166</td>
                <td>159</td>
                <td>0.744</td>
                <td>0.785</td>
                <td>0.868</td>
              </tr>
              <tr>
                <td>distal, over 30</td>
                <td>1,914</td>
                <td>31</td>
                <td>0.786</td>
                <td>0.744</td>
                <td>0.844</td>
              </tr>
            </tbody>
          </table>
          <p>
            These bands are descriptive and carry no comparison interval. The distal band holds only
            31 positives, and the band variable is itself a fitted feature of the baseline, so a
            reversal involving the baseline there is confounded with its supervision rather than
            simply imprecise.
          </p>

          <h3>What this does not establish</h3>
          <p>
            MFASS measures exon recognition in a minigene construct. These are not predictions of
            splicing in patient RNA. The baseline is supervised on this assay&rsquo;s training split
            while both specialists are zero-shot, so that comparison measures in-domain training
            against a specialist prior rather than the standalone quality of either tool. SpliceAI
            ran on its bundled GENCODE v24 annotation and Pangolin on v44, so the gap between them
            carries an annotation difference as well as a model difference. A matched-annotation run
            is needed before attributing the size or direction of that gap to the models alone. A
            frozen DNABERT-2 protocol is now reported separately in mfass-v2.
          </p>
        </div>
      </section>

      <section className="block">
        <div className="wrap prose-brief">
          <h2 className="sec-head">Reproduce the preserved v1 baseline</h2>
          <p>
            The benchmark code is MIT licensed; the MFASS source data remains the authors&rsquo; work.
            The baseline path uses pinned benchmark and MFASS revisions, with no genome retrieval,
            because every assayed sequence is a self-contained 170-base window.
          </p>
          <pre>
            <code>{`git clone https://github.com/rewire-bio/rewire-benchmarks
cd rewire-benchmarks
git checkout edf5b5c0b83bec27975e8c8a30be88e7a3581a52
uv sync

curl -L -o benchmarks/mfass/data/snv_data_clean.txt \\
  https://raw.githubusercontent.com/KosuriLab/MFASS/9a8e4f27106be52aeb11acad27f95f5cded663a8/processed_data/snv/snv_data_clean.txt
curl -L -o benchmarks/mfass/data/snv_func_annot.txt \\
  https://raw.githubusercontent.com/KosuriLab/MFASS/9a8e4f27106be52aeb11acad27f95f5cded663a8/processed_data/snv/snv_func_annot.txt

uv run mfass-build
uv run mfass-split --key ensembl_id --key ensembl_gene_id \\
  --out benchmarks/mfass/splits/split-v2.tsv
uv run mfass-baseline`}</code>
          </pre>
          <p>
            The specialist runs additionally need a GRCh38 primary assembly and, for Pangolin, a
            GENCODE database. Both runners pin every flag explicitly, including the ones already at
            their defaults, because SpliceAI and Pangolin disagree about masking by default and that
            difference is easy to mistake for a difference between the models.
          </p>
          <p>
            <a className="btn btn-primary" href={REPO}>
              rewire-benchmarks on GitHub <span className="arr">&rarr;</span>
            </a>
          </p>
        </div>
      </section>

      <section className="block">
        <div className="wrap prose-brief">
          <h2 className="sec-head">Next</h2>
          <p>
            A matched-annotation SpliceAI run to close the confound above, Pangolin at its own
            masking default to measure what that setting is worth, and further pretrained encoders
            with declared scoring protocols. Further benchmarks will follow the same six rules.
          </p>
          <p>
            If there is a task or dataset you would like evaluated this way, or you think a result
            here is wrong, the repository takes issues and so do I.
          </p>
          <p>
            <a className="btn btn-ghost" href="mailto:tim@rewire.it">
              tim@rewire.it <span className="arr">&rarr;</span>
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
