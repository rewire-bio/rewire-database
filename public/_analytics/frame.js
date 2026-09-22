/* Isolate GA from parent history, form events and URLs. Loaded only after opt-in. */
(() => {
  "use strict";
  const origin = "https://benchmarks.rewire.it";
  const frameOrigin = "https://rewire-it.web.app";
  if (window.location.origin !== frameOrigin || window.parent === window) return;
  let id;
  let previous;
  let stopped = false;
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
  window.addEventListener("pagehide", stop);
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
      gtag("set", page);
    }
    gtag("event", "page_view", { ...page, send_to: id });
    previous = location;
  });
})();
