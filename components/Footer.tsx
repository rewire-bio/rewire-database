export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="top">
          <div className="lead">
            <a className="brand" href="https://rewirebio.io/">
              <span className="dot" />
              rewire.it
            </a>
          </div>
          <div className="col">
            <h3>Research</h3>
            <a href="/">Benchmark database</a>
            <a href="/evidence/">Evidence and sources</a>
            <a href="/?kind=result&amp;origin=literature#browse">Published results</a>
            <a href="/#downloads">Download the database</a>
            <a href="https://rewirebio.io/blog/">Articles</a>
          </div>
          <div className="col">
            <h3>Project</h3>
            <a href="https://github.com/rewire-bio">GitHub ↗</a>
            <a href="mailto:tim@rewire.it">tim@rewire.it</a>
            <a href="https://rewirebio.io/feed.xml">RSS ↗</a>
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
