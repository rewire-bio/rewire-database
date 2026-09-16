"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Database" },
  { href: "/evidence/", label: "Evidence and sources" },
];
export default function Header() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const links = (
    <>
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={
            (href === "/" ? pathname === "/" : pathname.startsWith(href))
              ? "active"
              : ""
          }
          onClick={() => setOpen(false)}
        >
          {label}
        </Link>
      ))}
      <a href="https://rewire.it/blog/">Articles</a>
    </>
  );
  return (
    <header className="topbar">
      <div className="wrap row">
        <a className="brand" href="https://rewire.it/">
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
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <nav className="mobile-nav" aria-label="Primary">
          <div className="wrap">{links}</div>
        </nav>
      )}
    </header>
  );
}
