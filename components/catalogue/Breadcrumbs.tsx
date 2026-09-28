import { Fragment, type ReactNode } from "react";
import { breadcrumbJsonLd, safeJsonLd, type BreadcrumbItem } from "@/lib/catalogue-sharing";

/** One list drives both visible navigation and its structured representation. */
export default function Breadcrumbs({ items, className = "breadcrumb", links = {} }: { items: BreadcrumbItem[]; className?: string; links?: Record<string, ReactNode> }) {
  return <>
    <nav className={className} aria-label="Breadcrumb">
      {items.map((item, index) => <Fragment key={item.path}>
        {index > 0 && <span aria-hidden="true">/</span>}
        {index === items.length - 1
          ? <span aria-current="page">{item.name}</span>
          : links[item.path] ?? <a href={item.path}>{item.name}</a>}
      </Fragment>)}
    </nav>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(items)) }} />
  </>;
}
