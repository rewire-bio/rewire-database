import type { Metadata } from "next";
import Link from "next/link";
import ContributionForm from "./ContributionForm";
import styles from "../database/database.module.css";
export const metadata: Metadata = {
  title: "Contribute biological model evidence",
  description:
    "Submit a specialist biological model, benchmark, result or correction for review.",
  robots: { index: false, follow: true },
  referrer: "no-referrer",
  alternates: { canonical: "https://benchmarks.rewire.it/contribute/" },
};
export default function ContributePage() {
  return (
    <>
      <header className="page-head">
        <div className="wrap">
          <span className="kick">Contribute evidence</span>
          <h1>Help improve the database</h1>
          <p className="intro">
            Suggest a specialist biological model, benchmark, published result
            or correction. Every contribution is reviewed before publication.
          </p>
        </div>
      </header>
      <section className="block first">
        <div className="wrap">
          <nav className={styles.nav}>
            <Link href="/">Back to the benchmark database</Link>
          </nav>
          <ContributionForm />
        </div>
      </section>
    </>
  );
}
