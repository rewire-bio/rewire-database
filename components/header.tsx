"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Database" },
  { href: "/use-cases/", label: "Use cases" },
  { href: "/benchmarks/", label: "Benchmarks" },
  { href: "/models/", label: "Models" },
  { href: "/evidence/", label: "Evidence and sources" },
  { href: "/contribute/", label: "Contribute" },
];
export function primaryNavigationHref(pathname: string) {
  const path = `${pathname.replace(/\/+$/, "")}/`;
  if (path.startsWith("/database/model/")) return "/models/";
  if (path.startsWith("/database/benchmark/")) return "/benchmarks/";
  if (["/literature/", "/investigations/"].some((prefix) => path.startsWith(prefix))) return "/evidence/";
  return NAV.find(({ href }) => href !== "/" && path.startsWith(href))?.href
    || (path === "/" || path.startsWith("/database/") ? "/" : undefined);
}

export default function Header() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const activeHref = primaryNavigationHref(pathname);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);
  const links = (
    <>
      {NAV.map(({ href, label }) => {
        // Enter the private workflow in a fresh document without public trackers.
        const NavigationLink = href === "/contribute/" ? "a" : Link;
        return <NavigationLink
          key={href}
          href={href}
          className={activeHref === href ? "active" : ""}
          aria-current={activeHref === href ? (pathname.replace(/\/+$/, "") === href.replace(/\/+$/, "") ? "page" : "location") : undefined}
          onClick={() => setOpen(false)}
        >
          {label}
        </NavigationLink>;
      })}
      <a href="https://rewirebio.io/blog/">Articles ↗</a>
    </>
  );
  return (
    <header className="topbar">
      <div className="wrap row">
        <a
          className="brand"
          href="/"
          aria-label="rewirebio.io benchmark database home"
        >
          <span className="dot" />
          rewirebio.io
          <span className="brand-sub">benchmarks</span>
        </a>
        <nav className="nav desktop" aria-label="Primary">
          {links}
        </nav>
        <button
          ref={toggleRef}
          type="button"
          className="nav-toggle"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-primary-navigation"
        >
          {open ? <X aria-hidden="true" className="h-6 w-6" /> : <Menu aria-hidden="true" className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-primary-navigation"
          className="mobile-nav"
          aria-label="Primary"
        >
          <div className="wrap">{links}</div>
        </nav>
      )}
    </header>
  );
}
