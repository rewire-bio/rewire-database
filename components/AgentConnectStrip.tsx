"use client";
import { usePathname } from "next/navigation";
import AgentBanner from "./AgentBanner";

/** The browse pages where people start; the home page has the full box, and record pages with a
 * run recipe have their own "Reproduce with your agent" prompt. */
export const AGENT_STRIP_PATHS = ["/use-cases/", "/benchmarks/", "/models/", "/evidence/"];

/** A compact "connect your agent" box at the foot of the browse pages. */
export default function AgentConnectStrip() {
  const pathname = usePathname() || "/";
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (!AGENT_STRIP_PATHS.includes(path)) return null;
  return <div className="wrap"><AgentBanner /></div>;
}
