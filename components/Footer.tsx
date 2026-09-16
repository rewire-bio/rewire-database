export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="top">
          <div className="lead">
            <a className="brand" href="https://rewire.it/">
              <span className="dot" />
              rewire.it
            </a>
          </div>
          <div className="col">
            <h3>Research</h3>
            <a href="/">Benchmark database</a>
            <a href="/evidence/">Evidence and sources</a>
            <a href="/literature/">Historical literature links</a>
            <a href="https://rewire.it/blog/">Articles</a>
          </div>
          <div className="col">
            <h3>Project</h3>
            <a href="https://github.com/rewire-bio">GitHub ↗</a>
            <a href="mailto:tim@rewire.it">tim@rewire.it</a>
            <a href="https://rewire.it/feed.xml">RSS ↗</a>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} rewire.it</span>
          <span>Genomics · Proteins · Molecular Design</span>
        </div>
      </div>
    </footer>
  );
}
