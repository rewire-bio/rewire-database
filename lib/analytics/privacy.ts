export const ANALYTICS_ORIGIN = "https://benchmarks.rewire.it";
// Existing Firebase Hosting alias for this site; a separate browser origin
// prevents Google's script from inspecting the parent URL, DOM or history.
export const ANALYTICS_FRAME_ORIGIN = "https://rewire-it.web.app";
export const CONSENT_KEY = "rewire-benchmarks-analytics-v1";
export const CLIENT_KEY = "rewire-benchmarks-analytics-client-v1";
const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;

export function isPublicAnalyticsPath(pathname: string) {
  return /^\/(?:$|(?:evidence|audits)\/?$|runs\/mfass-v[12]\/?$|database\/[a-z_-]+\/[a-z0-9-]+\/?$)/.test(pathname);
}

export function publicPage(location: Pick<Location, "origin" | "pathname">, title: string) {
  if (location.origin !== ANALYTICS_ORIGIN || !isPublicAnalyticsPath(location.pathname)) return null;
  return {
    location: ANALYTICS_ORIGIN + location.pathname,
    title: title.replace(/[\r\n\t]/g, " ").slice(0, 180),
  };
}

/** External referrers are reduced to their origin. Private internal paths are omitted. */
export function publicReferrer(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return "";
    if (url.origin === ANALYTICS_ORIGIN) {
      return isPublicAnalyticsPath(url.pathname) ? url.origin + url.pathname : "";
    }
    return url.origin + "/";
  } catch { return ""; }
}

export type Consent = "granted" | "denied";
export function readConsent(value: string | null, now = Date.now()): Consent | null {
  try {
    const stored = JSON.parse(value || "null");
    if (!stored || !["granted", "denied"].includes(stored.choice) ||
      !Number.isFinite(stored.at) || stored.at > now || now - stored.at > CONSENT_LIFETIME) return null;
    return stored.choice;
  } catch { return null; }
}

export function privacySignal(navigator: { doNotTrack?: string | null; globalPrivacyControl?: boolean }) {
  return navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
}
