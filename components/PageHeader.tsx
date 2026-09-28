import type { ReactNode } from "react";
import Breadcrumbs from "@/components/catalogue/Breadcrumbs";
import type { BreadcrumbItem } from "@/lib/catalogue-sharing";

/**
 * Shared compact header for discovery pages: optional breadcrumb, a short
 * metadata line, one h1, a lead paragraph and optional actions.
 */
export default function PageHeader({ breadcrumbs, breadcrumbLinks, eyebrow = [], title, intro, children }: {
  breadcrumbs?: BreadcrumbItem[];
  /** Replaces a breadcrumb link, keyed by path, while keeping its visible name and href in exported HTML. */
  breadcrumbLinks?: Record<string, ReactNode>;
  eyebrow?: ReactNode[];
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return <header className="page-head compact"><div className="wrap">
    {breadcrumbs && <Breadcrumbs items={breadcrumbs} links={breadcrumbLinks} />}
    {eyebrow.length > 0 && <p className="eyebrow">{eyebrow.map((item, index) => <span key={index}>{item}</span>)}</p>}
    <h1>{title}</h1>
    {intro && <p className="intro">{intro}</p>}
    {children && <div className="head-actions">{children}</div>}
  </div></header>;
}
