"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Database" },
  { href: "/benchmarks/", label: "Benchmarks" },
  { href: "/models/", label: "Models" },
  { href: "/evidence/", label: "Evidence and sources" },
  { href: "/contribute/", label: "Contribute" },
];
export default function Header() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const links = (
    <>
      {NAV.map(({ href, label }) => {
        // Enter the private workflow in a fresh document without public trackers.
        const NavigationLink = href === "/contribute/" ? "a" : Link;
        return <NavigationLink
          key={href}
          href={href}
          className={
            (
              href === "/"
                ? pathname === "/" || pathname.startsWith("/database/")
                : pathname.startsWith(href)
            )
              ? "active"
              : ""
          }
          aria-current={
            (
              href === "/"
                ? pathname === "/" || pathname.startsWith("/database/")
                : pathname.startsWith(href)
            )
              ? "page"
              : undefined
          }
          onClick={() => setOpen(false)}
        >
          {label}
        </NavigationLink>;
      })}
      <a href="https://rewire.it/blog/">Articles</a>
    </>
  );
  return (
    <header className="topbar">
      <div className="wrap row">
        <a
          className="brand"
          href="/"
          aria-label="rewire.it benchmark database home"
        >
          <span className="dot" />
          rewire.it
        </a>
        <nav className="nav desktop" aria-label="Primary">
          {links}
        </nav>
        <button
          className="nav-toggle"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-primary-navigation"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
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
