#!/usr/bin/env node
/** Public-page mobile lab measurements. Always owns a new temporary Chrome profile. */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { once } from "node:events";

const targetPaths = {
  home: "/",
  vcc: "/database/benchmark/discovery-benchmark-virtual-cell-challenge-2026/",
  cafa: "/database/benchmark/discovery-benchmark-cafa/",
  scib: "/database/benchmark/discovery-benchmark-scib/",
  casp: "/database/benchmark/discovery-benchmark-casp/",
};
const { values } = parseArgs({ options: {
  help: { type: "boolean" }, describe: { type: "boolean" },
  origin: { type: "string", default: process.env.PERF_ORIGIN || "https://benchmarks.rewire.it" },
  "debug-port": { type: "string", default: process.env.PERF_DEBUG_PORT || "9339" },
  output: { type: "string", default: process.env.PERF_OUTPUT || "workbench/mobile-performance" },
  phase: { type: "string", default: process.env.PERF_PHASE },
  chrome: { type: "string", default: process.env.PERF_CHROME || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome") },
  targets: { type: "string", default: "home,vcc,cafa,scib,casp" },
  runs: { type: "string", default: "3" },
  revision: { type: "string", default: process.env.PERF_REVISION || "not supplied" },
  "hosting-version": { type: "string", default: process.env.PERF_HOSTING_VERSION || "not supplied" },
  "field-data": { type: "boolean", default: false },
} });
if (values.help) {
  console.log(`Usage: node scripts/performance/mobile-lab.mjs --phase <before|after|label> [options]

  --origin URL            Public HTTPS origin; localhost HTTP also allowed
  --debug-port PORT       Unused local port for the owned Chrome (default 9339)
  --output DIRECTORY      Root for raw results; creates DIRECTORY/PHASE exclusively
  --chrome EXECUTABLE     Chrome binary; always launched with a new temporary profile
  --targets LIST          Comma-separated home,vcc,cafa,scib,casp (default all)
  --runs N                1–10 runs per target (default 3; use 3 for matched comparison)
  --revision SHA          Deployment revision label; not independently verified
  --hosting-version ID    Hosting version label; not independently verified
  --field-data            Try public unauthenticated PSI once; no retries/auth/payment
  --describe             Print target URLs and conditions without launching/writing
  --help                 Show this message

Environment equivalents: PERF_ORIGIN, PERF_DEBUG_PORT, PERF_OUTPUT, PERF_PHASE,
PERF_CHROME, PERF_REVISION, PERF_HOSTING_VERSION.

Fixed matched conditions: 390×844, DPR1, 4×CPU,150ms latency,1.6Mbps down,
750Kbps up; fresh context/cache disabled per navigation; no consent/interaction.
Existing phases and occupied debugging ports are refused. No existing Chrome
profile or debugging session is attached. Ctrl-C closes the owned browser.`);
  process.exit(0);
}
const origin = new URL(values.origin);
if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
    !(origin.protocol === "https:" || origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) {
  throw new Error("Use a public HTTPS origin (or localhost HTTP), without credentials, paths or query parameters.");
}
if (!values.phase || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(values.phase)) throw new Error("Provide --phase with a lowercase alphanumeric label; dashes/underscores are allowed.");
const port = Number(values["debug-port"]);
const runs = Number(values.runs);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid debugging port.");
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error("Runs must be an integer from 1 to 10.");
const keys = values.targets.split(",");
if (new Set(keys).size !== keys.length || keys.some(key => !Object.hasOwn(targetPaths, key))) throw new Error("Unknown or duplicate target; see --help.");
const targets = keys.map(key => ({ key, url: new URL(targetPaths[key], origin).href }));
const conditions = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
  cpuSlowdown: 4,
  network: { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8, connectionType: "cellular4g" },
  sampleMinimumMilliseconds: 20000, afterLoadMilliseconds: 5000, maxMilliseconds: 60000, runs,
  cache: "new isolated browser context per navigation; cache disabled; service workers bypassed",
  consent: "first visit; no analytics consent or interaction",
  note: "Lab observations, not field data, TBT or INP; actual Chrome UA retained. Latency in ms; throughput in bytes/second. Cold browser cache, not cold CDN/DNS.",
};
const phase = values.phase;
const out = path.resolve(values.output, phase);
if (values.describe) {
  console.log(JSON.stringify({ origin: origin.origin, phase, out, targets, conditions }, null, 2));
  process.exit(0);
}
const write = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class CDP {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.listeners = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id) return this.listeners.forEach(listener => listener(message));
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id); clearTimeout(entry.timer);
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("CDP connection closed")); }
      this.pending.clear();
    });
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  close() { this.socket.close(); }
}
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("CDP socket timeout")); }, 10000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP socket error")); }, { once: true });
  });
  return new CDP(socket);
}
async function assertUnusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () => reject(new Error(`Port ${port} is occupied; refusing to attach to an existing browser.`)));
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise(resolve => probe.close(resolve));
}

// Same observer types, element capture and sampling window as the executed baseline.
function observePage() {
  const state = { lcp: [], layoutShifts: [], longTasks: [], errors: [] };
  window.__perfLab = state;
  for (const type of ["largest-contentful-paint", "layout-shift", "longtask"]) {
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (type === "largest-contentful-paint") state.lcp.push({
            startTime: entry.startTime, renderTime: entry.renderTime, loadTime: entry.loadTime,
            size: entry.size, url: entry.url, id: entry.id,
            element: entry.element ? { tag: entry.element.tagName, id: entry.element.id, cls: entry.element.className, text: entry.element.textContent?.slice(0, 160) } : null,
          });
          if (type === "layout-shift") state.layoutShifts.push({
            startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput,
            sources: (entry.sources || []).map(source => ({ tag: source.node?.tagName, id: source.node?.id, previousRect: source.previousRect, currentRect: source.currentRect })),
          });
          if (type === "longtask") state.longTasks.push({
            startTime: entry.startTime, duration: entry.duration, name: entry.name,
            attribution: entry.attribution?.map(item => ({ name: item.name, containerType: item.containerType, containerSrc: item.containerSrc })),
          });
        }
      }).observe({ type, buffered: true });
    } catch (error) { state.errors.push(String(error)); }
  }
}
function readPage() {
  return {
    url: location.href, title: document.title, readyState: document.readyState, now: performance.now(),
    paint: performance.getEntriesByType("paint").map(entry => entry.toJSON()),
    navigation: performance.getEntriesByType("navigation").map(entry => entry.toJSON()),
    resources: performance.getEntriesByType("resource").map(entry => entry.toJSON()),
    ...window.__perfLab,
    domNodes: document.querySelectorAll("*").length, scriptCount: document.scripts.length,
    inlineScriptCharacters: [...document.scripts].filter(script => !script.src).reduce((n, script) => n + script.textContent.length, 0),
    inlineFlightCharacters: [...document.scripts].filter(script => script.textContent.includes("self.__next_f.push")).reduce((n, script) => n + script.textContent.length, 0),
    viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
  };
}
function summarize(observed, network) {
  let cls = 0, total = 0, start = null, last = 0;
  for (const shift of observed.layoutShifts.filter(item => !item.hadRecentInput)) {
    if (start === null || shift.startTime - last > 1000 || shift.startTime - start > 5000) { total = shift.value; start = shift.startTime; }
    else total += shift.value;
    last = shift.startTime; cls = Math.max(cls, total);
  }
  const wire = type => network.filter(item => !type || item.type === type).reduce((n, item) => n + (item.wireBytes || 0), 0);
  return {
    fcpMilliseconds: observed.paint.find(item => item.name === "first-contentful-paint")?.startTime ?? null,
    lcpMilliseconds: observed.lcp.at(-1)?.startTime ?? null, lcpElement: observed.lcp.at(-1)?.element ?? null, cls,
    maxLongTaskMilliseconds: Math.max(0, ...observed.longTasks.map(item => item.duration)),
    longTaskCount: observed.longTasks.length,
    longTaskTotalMilliseconds: observed.longTasks.reduce((n, item) => n + item.duration, 0),
    documentWireBytes: wire("Document"), totalWireBytes: wire(), javascriptWireBytes: wire("Script"),
    javascriptDecodedBytes: observed.resources.filter(item => item.initiatorType === "script").reduce((n, item) => n + item.decodedBodySize, 0),
    htmlDecodedBytes: observed.navigation[0]?.decodedBodySize, htmlEncodedBytes: observed.navigation[0]?.encodedBodySize,
    inlineFlightCharacters: observed.inlineFlightCharacters, domNodes: observed.domNodes,
    rscPrefetchDecodedBytes: observed.resources.filter(item => item.name.includes("_rsc=")).reduce((n, item) => n + item.decodedBodySize, 0),
    rscPrefetchWireBytes: network.filter(item => item.url.includes("_rsc=")).reduce((n, item) => n + (item.wireBytes || 0), 0),
  };
}
const endpoint = `http://127.0.0.1:${port}`;
let browser, child, log, profile, stopping = false;
const results = [], failures = [];
function stopOnSignal() { stopping = true; child?.kill("SIGTERM"); }
process.on("SIGINT", stopOnSignal); process.on("SIGTERM", stopOnSignal);
try {
  await assertUnusedPort();
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.mkdir(out); // Deliberately not recursive: an existing phase must never be overwritten.
  profile = await fs.mkdtemp(path.join(os.tmpdir(), "rewire-mobile-lab-"));
  log = await fs.open(path.join(out, "chrome.log"), "wx");
  child = spawn(values.chrome, ["--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", "about:blank"], { stdio: ["ignore", log.fd, log.fd] });
  let launchError; child.on("error", error => { launchError = error; });
  let browserInfo;
  for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Chrome exited: ${child.exitCode}`);
    try { browserInfo = await (await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await delay(200); }
  }
  if (!browserInfo) throw new Error("Owned Chrome did not start.");
  browser = await connect(browserInfo.webSocketDebuggerUrl);
  await write("conditions.json", {
    date: new Date().toISOString(), origin: origin.origin, phase, targets, conditions, browserInfo,
    deployment: { revision: values.revision, hostingVersion: values["hosting-version"], verification: "Operator-supplied labels; validate deployment separately." },
    host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpuModel: os.cpus()[0]?.model, logicalCpuCount: os.cpus().length, totalMemoryBytes: os.totalmem(), nodeVersion: process.version },
  });
  for (let run = 1; run <= runs && !stopping; run++) for (const target of targets) {
    if (stopping) break;
    const context = (await browser.call("Target.createBrowserContext")).browserContextId;
    let page, loadAt = null;
    const network = new Map(), errors = [];
    try {
      const id = (await browser.call("Target.createTarget", { url: "about:blank", browserContextId: context })).targetId;
      const available = await (await fetch(`${endpoint}/json/list`)).json();
      page = await connect(available.find(item => item.id === id).webSocketDebuggerUrl);
      page.listeners.push(message => {
        const p = message.params;
        if (message.method === "Page.loadEventFired") loadAt = Date.now();
        if (message.method === "Network.requestWillBeSent") network.set(p.requestId, { id: p.requestId, url: p.request.url, type: p.type, method: p.request.method });
        if (message.method === "Network.responseReceived") {
          const item = network.get(p.requestId);
          if (item) Object.assign(item, { status: p.response.status, mimeType: p.response.mimeType, fromDiskCache: p.response.fromDiskCache, fromServiceWorker: p.response.fromServiceWorker, headers: p.response.headers });
        }
        if (message.method === "Network.loadingFinished" && network.has(p.requestId)) network.get(p.requestId).wireBytes = p.encodedDataLength;
        if (message.method === "Network.loadingFailed" && network.has(p.requestId)) network.get(p.requestId).failure = p.errorText;
        if (message.method === "Runtime.exceptionThrown" || message.method === "Log.entryAdded" && p.entry.level === "error" || message.method === "Runtime.consoleAPICalled" && p.type === "error") errors.push(message);
      });
      for (const domain of ["Page", "Runtime", "Log", "Network", "Performance"]) await page.call(`${domain}.enable`);
      await page.call("Network.setCacheDisabled", { cacheDisabled: true });
      await page.call("Network.setBypassServiceWorker", { bypass: true });
      await page.call("Emulation.setDeviceMetricsOverride", conditions.viewport);
      await page.call("Emulation.setCPUThrottlingRate", { rate: conditions.cpuSlowdown });
      await page.call("Network.emulateNetworkConditions", conditions.network);
      await page.call("Page.addScriptToEvaluateOnNewDocument", { source: `(${observePage.toString()})()` });
      const navStart = Date.now();
      const navigation = await page.call("Page.navigate", { url: target.url });
      if (navigation.errorText) throw new Error(navigation.errorText);
      while (!stopping && Date.now() - navStart < conditions.maxMilliseconds) {
        await delay(1000);
        if (Date.now() - navStart >= conditions.sampleMinimumMilliseconds && loadAt && Date.now() - loadAt >= conditions.afterLoadMilliseconds) break;
      }
      if (stopping) throw new Error("Interrupted by operator");
      const observed = await page.evaluate(`(${readPage.toString()})()`);
      if (!observed.lcp || !observed.longTasks || !observed.layoutShifts) throw new Error("Performance observers did not initialize.");
      const records = [...network.values()];
      const mainDocument = records.find(item => item.type === "Document" && item.url === target.url);
      if (mainDocument?.status !== 200 || observed.readyState !== "complete" || observed.url !== target.url) throw new Error(`Incomplete or unsuccessful target navigation: ${observed.url}, status ${mainDocument?.status}, ${observed.readyState}`);
      if (observed.errors.length) throw new Error(`Observer errors: ${observed.errors.join("; ")}`);
      const receipt = { target, run, phase, date: new Date().toISOString(), conditions, observed, metrics: (await page.call("Performance.getMetrics")).metrics, network: records, errors, sampleWallMilliseconds: Date.now() - navStart, summary: summarize(observed, records) };
      await write(`${target.key}-run-${run}.json`, receipt);
      results.push({ key: target.key, run, ...receipt.summary });
      console.log(JSON.stringify({ key: target.key, run, ...receipt.summary }));
      if (run === 1) {
        const screenshot = await page.call("Page.captureScreenshot", { format: "png" });
        await fs.writeFile(path.join(out, `${target.key}-mobile.png`), Buffer.from(screenshot.data, "base64"), { flag: "wx" });
        const document = records.find(item => item.type === "Document" && item.url === target.url);
        if (document) {
          const body = await page.call("Network.getResponseBody", { requestId: document.id });
          const bytes = Buffer.from(body.body, body.base64Encoded ? "base64" : "utf8");
          await fs.writeFile(path.join(out, `${target.key}.html`), bytes, { flag: "wx" });
          const scripts = [...bytes.toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
          await write(`${target.key}-payload.json`, { decodedHtmlBytes: bytes.length, inlineScriptBytes: scripts.reduce((n, script) => n + Buffer.byteLength(script), 0), inlineFlightScriptBytes: scripts.filter(script => script.includes("self.__next_f.push")).reduce((n, script) => n + Buffer.byteLength(script), 0) });
        }
      }
    } catch (error) {
      const failure = { target, run, error: String(error), errors, network: [...network.values()] };
      failures.push(failure); await write(`${target.key}-run-${run}-error.json`, failure); console.error(JSON.stringify(failure));
    } finally {
      page?.close(); await browser.call("Target.disposeBrowserContext", { browserContextId: context }).catch(() => {});
    }
  }
  await write("summary.json", results);
  const numeric = Object.keys(results[0] || {}).filter(key => !["key", "run"].includes(key) && typeof results[0][key] === "number");
  const aggregate = targets.map(({ key }) => ({ key, runs: results.filter(row => row.key === key).length, metrics: Object.fromEntries(numeric.map(metric => {
    const sorted = results.filter(row => row.key === key && typeof row[metric] === "number").map(row => row[metric]).sort((a, b) => a - b);
    return [metric, { n: sorted.length, median: sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : null, min: sorted[0] ?? null, max: sorted.at(-1) ?? null }];
  })) }));
  await write("aggregate.json", aggregate);
  const columns = ["key", "run", ...numeric];
  await fs.writeFile(path.join(out, "summary.csv"), [columns.join(","), ...results.map(row => columns.map(key => row[key] ?? "").join(","))].join("\n") + "\n", { flag: "wx" });
  if (values["field-data"] && !stopping) {
    const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(origin.origin + "/")}&strategy=mobile&category=performance`;
    const field = { url, requestedAt: new Date().toISOString() };
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      const json = await response.json();
      Object.assign(field, { status: response.status, loadingExperience: json.loadingExperience ?? null, originLoadingExperience: json.originLoadingExperience ?? null, error: json.error ?? null });
    } catch (error) { field.error = String(error); }
    await write("field-data-attempt.json", field);
  }
  if (failures.length || stopping || results.length !== runs * targets.length) process.exitCode = 1;
} finally {
  if (browser) { await browser.call("Browser.close").catch(() => {}); browser.close(); }
  if (child && child.exitCode === null) {
    const exited = once(child, "exit"); child.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await Promise.race([exited, delay(3000)]); }
  }
  await log?.close();
  if (profile) await fs.rm(profile, { recursive: true, force: true });
  process.removeListener("SIGINT", stopOnSignal); process.removeListener("SIGTERM", stopOnSignal);
}
