"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_ORIGIN, ANALYTICS_FRAME_ORIGIN, CLIENT_KEY, CONSENT_KEY, Consent, isPublicAnalyticsPath, privacySignal, publicPage, publicReferrer, readConsent } from "@/lib/analytics/privacy";
import styles from "./SiteAnalytics.module.css";

const measurementId = process.env.NEXT_PUBLIC_GA_ID || "";
const configured = process.env.NODE_ENV === "production" && /^G-[A-Z0-9]+$/.test(measurementId);

export default function SiteAnalytics() {
  const pathname = usePathname() || "/";
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<Consent | null>(null);
  const [preferences, setPreferences] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const clientId = useRef<string>();
  const stopTimer = useRef<ReturnType<typeof setTimeout>>();
  const publicPath = isPublicAnalyticsPath(pathname);

  function stop() {
    clientId.current = undefined;
    try { localStorage.removeItem(CLIENT_KEY); } catch { /* Storage can be unavailable. */ }
    if (!frame.current?.contentWindow) return;
    setStopping(true);
    frame.current.contentWindow.postMessage({ type: "rewire-stop" }, ANALYTICS_FRAME_ORIGIN);
    // Tear down even if the frame or network is blocked; never wait indefinitely.
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => setStopping(false), 1000);
  }

  useEffect(() => {
    if (!configured || window.location.origin !== ANALYTICS_ORIGIN) return;
    setBlocked(privacySignal(navigator));
    try {
      const saved = readConsent(localStorage.getItem(CONSENT_KEY));
      setChoice(saved);
      if (saved !== "granted") localStorage.removeItem(CLIENT_KEY);
    } catch { /* No persistence when storage is unavailable. */ }
    setReady(true);
    const changed = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY || event.key === null) {
        const next = readConsent(event.newValue);
        if (next !== "granted") stop();
        else {
          clearTimeout(stopTimer.current);
          setStopping(false);
          setFrameKey(key => key + 1);
        }
        setChoice(next);
      }
    };
    const stopped = (event: MessageEvent) => {
      if (event.origin === ANALYTICS_FRAME_ORIGIN && event.source === frame.current?.contentWindow && event.data?.type === "rewire-stopped") {
        clearTimeout(stopTimer.current);
        setStopping(false);
      }
    };
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // A BFCache-restored child was disabled on pagehide; always replace it.
      clearTimeout(stopTimer.current);
      setStopping(false);
      setBlocked(privacySignal(navigator));
      clientId.current = undefined;
      try {
        const saved = readConsent(localStorage.getItem(CONSENT_KEY));
        setChoice(saved);
        if (saved !== "granted") localStorage.removeItem(CLIENT_KEY);
      } catch { setChoice(null); }
      setFrameKey(key => key + 1);
    };
    window.addEventListener("storage", changed);
    window.addEventListener("message", stopped);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("message", stopped);
      window.removeEventListener("pageshow", restored);
      clearTimeout(stopTimer.current);
    };
  }, []);

  const active = ready && publicPath && choice === "granted" && !blocked;
  function sendPage() {
    if (!active || stopping) return;
    const page = publicPage(window.location, document.title);
    if (!clientId.current) {
      let stored = "";
      try { stored = localStorage.getItem(CLIENT_KEY) || ""; } catch { /* Session-only identity. */ }
      clientId.current = /^[a-f0-9-]{36}$/.test(stored) ? stored : crypto.randomUUID();
      try { localStorage.setItem(CLIENT_KEY, clientId.current); } catch { /* Session-only identity. */ }
    }
    if (page) frame.current?.contentWindow?.postMessage({
      type: "rewire-public-page", measurementId, clientId: clientId.current, page,
      referrer: publicReferrer(document.referrer),
    }, ANALYTICS_FRAME_ORIGIN);
  }
  useEffect(() => {
    sendPage();
    // Query and fragment changes deliberately do not create analytics events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pathname, stopping]);

  function choose(value: Consent) {
    if (value === "denied") stop();
    else {
      clearTimeout(stopTimer.current);
      setStopping(false);
      setFrameKey(key => key + 1);
    }
    setChoice(value);
    setPreferences(false);
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ choice: value, at: Date.now() })); } catch { /* Session-only choice. */ }
  }

  if (!ready || !publicPath) return null;
  return (
    <>
      <div className={styles.preferences}>
        <button type="button" onClick={() => setPreferences(!preferences)} aria-expanded={preferences || (!choice && !blocked)} aria-controls="analytics-preferences">
          Analytics preferences
        </button>
      </div>
      {(preferences || (!choice && !blocked)) && (
        <section id="analytics-preferences" className={styles.notice} aria-label="Analytics preferences">
          <p>With your permission, Google Analytics counts visits to public pages. Search terms, URL parameters and contribution pages are excluded. <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google privacy policy</a></p>
          {blocked ? <p>Your browser’s privacy preference has disabled analytics.</p> : (
            <div className={styles.actions}>
              <button type="button" onClick={() => choose("granted")}>Allow analytics</button>
              <button type="button" onClick={() => choose("denied")}>No thanks</button>
            </div>
          )}
          {preferences && <button type="button" onClick={() => setPreferences(false)}>Close preferences</button>}
        </section>
      )}
      {(active || stopping) && <iframe key={frameKey} ref={frame} src={`${ANALYTICS_FRAME_ORIGIN}/_analytics/`} title="Consented analytics" hidden aria-hidden="true" tabIndex={-1} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" onLoad={sendPage} />}
    </>
  );
}
