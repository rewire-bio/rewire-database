import { relatedUseCaseArticles, articleHref } from "@/lib/use-case-articles";
import styles from "./UseCases.module.css";

export default function UseCaseArticles({ slug }: { slug: string }) {
  const articles = relatedUseCaseArticles(slug);
  if (!articles.length) return null;

  return <section id="related-articles" className={styles.section}>
    <h2>Related articles</h2>
    <p>Read the background, methods and practical considerations behind this question.</p>
    <ul className={styles.articleList}>
      {articles.map((article) => <li key={article.slug}>
        <h3><a href={articleHref(article)}>{article.title}</a></h3>
        <p>{article.description}</p>
      </li>)}
    </ul>
  </section>;
}
