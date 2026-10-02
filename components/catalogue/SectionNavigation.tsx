"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeBrowseReturnTo } from "@/lib/omics-browse";
import styles from "./SectionNavigation.module.css";

export interface PageSection {
  id: string;
  label: string;
}

/** Old fragment links still reveal content now held in disclosures. */
export function revealFragment(hash: string) {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return;
  }
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  let parent = target.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
  if (
    ["specifications", "how-it-works", "sources", "evidence-claims"].includes(
      id,
    )
  ) {
    target
      .querySelectorAll<HTMLDetailsElement>(":scope > details")
      .forEach((detail) => {
        detail.open = true;
      });
  }
  requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
}

function BrowseReturnLink({ href }: { href: string }) {
  return (
    <a className={styles.back} href={href}>
      ← Back to results
    </a>
  );
}

function ReactiveBrowseReturn({ fallback }: { fallback: string }) {
  const search = useSearchParams();
  const href = safeBrowseReturnTo(search.get("return_to")) || fallback;
  return <BrowseReturnLink href={href} />;
}

export function BrowseReturn({ fallback }: { fallback: string }) {
  return (
    <Suspense fallback={<BrowseReturnLink href={fallback} />}>
      <ReactiveBrowseReturn fallback={fallback} />
    </Suspense>
  );
}

export default function SectionNavigation({
  sections,
}: {
  sections: PageSection[];
}) {
  const [active, setActive] = useState(sections[0]?.id || "");
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--section-nav-height");
    const setHeight = () => {
      root.style.setProperty("--section-nav-height", `${nav.offsetHeight}px`);
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      if (previous) {
        root.style.setProperty("--section-nav-height", previous);
      } else {
        root.style.removeProperty("--section-nav-height");
      }
    };
  }, []);

  useEffect(() => {
    const reveal = () => revealFragment(window.location.hash);
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.hash
      ) {
        revealFragment(url.hash);
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", click);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    sections.forEach((section) => {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    });
    return () => {
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", click);
      observer.disconnect();
    };
  }, [sections]);
  return (
    <nav ref={navRef} className={styles.nav} aria-label="On this page">
      <div className={styles.links}>
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active === section.id ? "location" : undefined}
            onClick={() => setActive(section.id)}
          >
            {section.label}
          </a>
        ))}
      </div>
      <label className={styles.mobile}>
        On this page
        <select
          value={active}
          onChange={(event) => {
            setActive(event.target.value);
            window.location.hash = event.target.value;
          }}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
