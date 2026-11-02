/* Isolate GA from parent history, form events and URLs. Loaded only after opt-in. */
(() => {
  "use strict";
  const origin = "https://benchmarks.rewirebio.io";
  const frameOrigin = "https://rewire-it.web.app";
  if (window.location.origin !== frameOrigin || window.parent === window) return;
  let id;
  let previous;
  let stopped = false;
  // gtag cannot see foreground time from a hidden frame (it never has focus), so the parent reports
  // only whether its page is visible and focused, and this frame sends the engagement time itself.
  let foreground = false;
  let since = null;
  let engaged = 0;
  const clock = () => (window.performance ? window.performance.now() : Date.now());
  function settle() {
    const now = clock();
    if (since !== null) engaged += now - since;
    since = foreground && document.visibilityState !== "hidden" ? now : null;
  }
  function flush() {
    settle();
    const ms = Math.round(engaged);
    engaged = 0;
    if (id && !stopped && ms > 0) gtag("event", "user_engagement", { engagement_time_msec: ms, send_to: id, transport_type: "beacon" });
  }
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  function stop() {
    stopped = true;
    if (id) window["ga-disable-" + id] = true;
    gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    try {
      document.cookie.split(";").forEach(cookie => {
        const name = cookie.split("=")[0].trim();
        if (name.startsWith("rewire_bench_")) document.cookie = name + "=; Max-Age=0; Path=/; Domain=rewire-it.web.app; Secure; SameSite=None";
      });
    } catch { /* Third-party storage can be blocked. */ }
  }
  // Queue the last engagement, then disable after gtag's own pagehide handler has sent its batch.
  // If the page is restored from the back/forward cache the timer runs then, and the parent replaces this frame.
  window.addEventListener("pagehide", () => { flush(); setTimeout(stop, 0); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); else settle(); });
  const allowed = path => /^\/(?:$|(?:evidence|audits)\/?$|runs\/mfass-v[12]\/?$|database\/[a-z_-]+\/[a-z0-9-]+\/?$)/.test(path);
  const pageUrl = value => {
    try {
      const url = new URL(value);
      return url.origin === origin && !url.username && !url.password && allowed(url.pathname) ? origin + url.pathname : null;
    } catch { return null; }
  };
  const referrerUrl = value => {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return "";
      return url.origin === origin ? (pageUrl(value) || "") : url.origin + "/";
    } catch { return ""; }
  };
  window.addEventListener("message", event => {
    const data = event.data;
    if (event.origin !== origin || event.source !== window.parent) return;
    if (data?.type === "rewire-stop") {
      stop();
      window.parent.postMessage({ type: "rewire-stopped" }, origin);
      return;
    }
    if (data?.type === "rewire-foreground") {
      if (!stopped && typeof data.foreground === "boolean") { settle(); foreground = data.foreground; settle(); }
      return;
    }
    if (stopped || data?.type !== "rewire-public-page" ||
      !/^G-[A-Z0-9]+$/.test(data.measurementId) || !/^[a-f0-9-]{36}$/.test(data.clientId) || !data.page || typeof data.page.title !== "string") return;
    const location = pageUrl(data.page.location);
    if (!location || (id && id !== data.measurementId) || previous === location) return;
    const page = {
      page_location: location,
      page_title: data.page.title.replace(/[\r\n\t]/g, " ").slice(0, 180),
      page_referrer: previous || referrerUrl(data.referrer),
    };
    if (!id) {
      id = data.measurementId;
      gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      gtag("consent", "update", { analytics_storage: "granted" });
      gtag("js", new Date());
      gtag("set", page);
      gtag("config", id, { ...page, client_id: data.clientId, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: "rewire-it.web.app", cookie_prefix: "rewire_bench", cookie_flags: "SameSite=None;Secure" });
      const script = document.createElement("script");
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
      document.head.appendChild(script);
    } else {
      flush();
      gtag("set", page);
    }
    gtag("event", "page_view", { ...page, send_to: id });
    previous = location;
  });
})();
