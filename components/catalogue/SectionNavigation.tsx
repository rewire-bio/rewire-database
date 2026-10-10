"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { kindLabels, safeBrowseReturnTo } from "@/lib/omics-browse";
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
  let parent: HTMLElement | null = target;
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

/** Names where the link goes: the use case or search the reader came from,
 * or, without one, the list of records of this kind. */
export function browseReturnLabel(href: string, returned: boolean): string {
  const path = href.split(/[?#]/, 1)[0];
  if (/^\/use-cases\/[^/]+\/$/.test(path)) return "Back to the use case";
  if (path === "/use-cases/") return "Back to use cases";
  if (returned) return "Back to search";
  const kind = new URLSearchParams(href.split("?")[1]?.split("#")[0] || "").get("kind");
  const label = kind && kindLabels[kind as keyof typeof kindLabels];
  return label ? `Browse all ${label.toLowerCase()}` : "Browse the database";
}

function BrowseReturnLink({ href, returned }: { href: string; returned: boolean }) {
  return (
    <a className={styles.back} href={href}>
      ← {browseReturnLabel(href, returned)}
    </a>
  );
}

function ReactiveBrowseReturn({ fallback }: { fallback: string }) {
  const search = useSearchParams();
  const returned = safeBrowseReturnTo(search.get("return_to"));
  return <BrowseReturnLink href={returned || fallback} returned={!!returned} />;
}

export function BrowseReturn({ fallback }: { fallback: string }) {
  return (
    <Suspense fallback={<BrowseReturnLink href={fallback} returned={false} />}>
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
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        revealFragment(url.hash);
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    document.addEventListener("click", click);
    let frame = 0;
    const updateActive = () => {
      frame = 0;
      const boundary = navRef.current?.getBoundingClientRect().bottom ?? 120;
      const nodes = sections.map(({ id }) => document.getElementById(id)).filter((node): node is HTMLElement => !!node);
      // Include the 24px scroll-margin gap plus rounding tolerance at anchor stops.
      // The last section may be too short to reach the sticky navigation.
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const current = atBottom ? nodes.at(-1) : nodes.filter((node) => node.getBoundingClientRect().top <= boundary + 32).at(-1) || nodes[0];
      if (current) setActive(current.id);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateActive);
    };
    updateActive();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", click);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      cancelAnimationFrame(frame);
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
            revealFragment(`#${event.target.value}`);
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
