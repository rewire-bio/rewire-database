import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">404</span>
          <h1>Page not found</h1>
          <p className="intro">This page is unavailable or has moved in the current database release.</p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap prose-brief">
          <p>Start from one of the main entry points:</p>
          <ul>
            <li><a href="/">Browse and search the benchmark database</a></li>
            <li><Link href="/use-cases/">Explore biological and clinical use cases</Link></li>
            <li><Link href="/models/">Browse all indexed models</Link></li>
            <li><Link href="/benchmarks/">Browse all benchmarks and protocols</Link></li>
          </ul>
        </div>
      </section>
    </>
  );
}
