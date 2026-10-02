# rewire-database

Own the benchmark website, public query API and contribution service here. Reviewed records, evidence and release generation belong to rewire-bio/rewire-benchmark-data. Consume only the revision and manifest pinned in benchmark-data.lock.json; never author generated data/ or public/omics/ files here. Benchmark execution belongs to rewire-bio/rewire-benchmarks; editorial articles belong to rewire-bio/rewire.it.

Preserve scientific record IDs, values, source evidence and immutable release artifacts. Changes to records require review and a new release; do not rewrite prior releases. Keep unreviewed development on a separate branch. Never publish submissions automatically or include private contributor data in exports. Do not add credentials, emulator state or local research workspaces to Git.

Run tests, lint, type checking and the production build before publication. Use subagents for independent research and review when available, with exclusive file ownership.
