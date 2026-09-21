// family dev — serve a mock Family host page with the app in an iframe.
//
//   family dev [--port 4729] [--app <url-or-dir>]
//
// By default the current project is served under /app/* and the host page at /
// loads its entry html in an iframe. The entry's TypeScript is bundled with
// esbuild on request (node_modules resolved from the app dir, so the SDK can
// be a git/file dependency with a prebuilt dist) and the served html's script
// tag is rewritten to the bundle — the browser never sees a bare import.
// With --app <https url> the iframe points at that URL instead and nothing
// local is served.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { build, transform } from "esbuild";
import { MODULE_SCRIPT_RE, resolveEntryHtml } from "../lib/entry.mjs";

const DEFAULT_PORT = 4729;
const DEFAULT_WALLET = "0xDeviCe0000000000000000000000000000babe";
const BUNDLE_URL = "/app/__family_bundle.js";
const SCOPES = [
  "user:identity",
  "user:balance",
  "payments:charge",
  "storage:upload",
  "store:read",
  "store:write",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

export async function devCommand(args) {
  let port = DEFAULT_PORT;
  let appArg = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--port") port = Number(args[++i]);
    else if (a.startsWith("--port=")) port = Number(a.slice("--port=".length));
    else if (a === "--app") appArg = args[++i];
    else if (a.startsWith("--app=")) appArg = a.slice("--app=".length);
    else if (a === "--help" || a === "-h") {
      console.log("Usage: family dev [--port N] [--app <url-or-dir>]");
      return;
    } else {
      console.error(`family dev: unknown option ${a}`);
      process.exitCode = 1;
      return;
    }
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`family dev: invalid port "${port}"`);
    process.exitCode = 1;
    return;
  }

  // Resolve what the iframe loads and (optionally) which dir we serve.
  const cwd = process.cwd();
  let serveDir = null;
  let appUrl;
  let shareBps = 1000;
  let entry = null;
  let latestBundle = null;

  if (appArg && /^https?:\/\//i.test(appArg)) {
    appUrl = appArg;
    try {
      const s = new URL(appArg).searchParams.get("share");
      if (s) shareBps = Number(s);
    } catch {
      /* keep default */
    }
  } else {
    serveDir = path.resolve(cwd, appArg ?? ".");
    entry = resolveEntryHtml(serveDir);
    if (!fs.existsSync(entry.htmlPath)) {
      console.warn(`family dev: no ${entry.rel} found under ${serveDir}`);
      console.warn("The mock host will load but /app will 404. Scaffold first: family init app <name>");
    }
    appUrl = "/app/" + entry.rel.split("/").map(encodeURIComponent).join("/");
  }
  if (!Number.isFinite(shareBps)) shareBps = 1000;

  async function bundleApp() {
    const html = fs.readFileSync(entry.htmlPath, "utf8");
    const m = html.match(MODULE_SCRIPT_RE);
    if (!m) {
      throw new Error(`no <script type="module" src="..."> tag found in ${entry.rel}`);
    }
    const scriptEntry = path.resolve(path.dirname(entry.htmlPath), m[1]);
    if (!fs.existsSync(scriptEntry)) {
      throw new Error(`script entry not found: ${path.relative(serveDir, scriptEntry)}`);
    }
    const result = await build({
      entryPoints: [scriptEntry],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2020",
      absWorkingDir: serveDir,
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "silent",
    });
    return result.outputFiles[0].text;
  }

  async function serveEntryHtml(res) {
    try {
      latestBundle = await bundleApp();
    } catch (err) {
      send(res, 500, "text/plain; charset=utf-8", "Bundle failed: " + err.message);
      return;
    }
    const html = fs.readFileSync(entry.htmlPath, "utf8");
    const out = html.replace(
      MODULE_SCRIPT_RE,
      `<script type="module" src="${BUNDLE_URL}"></script>`
    );
    send(res, 200, "text/html; charset=utf-8", out);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        send(res, 200, "text/html; charset=utf-8", renderHostPage({ appUrl, shareBps }));
      } else if (url.pathname === BUNDLE_URL) {
        if (!serveDir) {
          send(res, 404, "text/plain; charset=utf-8", "No local app dir (started with --app <url>)");
          return;
        }
        if (latestBundle == null) {
          if (!fs.existsSync(entry.htmlPath)) {
            send(res, 404, "text/plain; charset=utf-8", `Not found: ${entry.rel}`);
            return;
          }
          try {
            latestBundle = await bundleApp();
          } catch (err) {
            send(res, 500, "text/plain; charset=utf-8", "Bundle failed: " + err.message);
            return;
          }
        }
        send(res, 200, "application/javascript; charset=utf-8", latestBundle);
      } else if (url.pathname.startsWith("/app/")) {
        if (!serveDir) {
          send(res, 404, "text/plain; charset=utf-8", "No local app dir (started with --app <url>)");
          return;
        }
        const rel = decodeURIComponent(url.pathname.slice("/app/".length)).replace(/^\/+/, "");
        const root = path.resolve(serveDir);
        const filePath = path.resolve(root, rel);
        if (filePath !== root && !filePath.startsWith(root + path.sep)) {
          send(res, 403, "text/plain; charset=utf-8", "Forbidden");
          return;
        }
        if (path.resolve(filePath) === path.resolve(entry.htmlPath)) {
          await serveEntryHtml(res);
          return;
        }
        await serveAppFile(res, serveDir, filePath);
      } else {
        send(res, 404, "text/plain; charset=utf-8", "Not found");
      }
    } catch (err) {
      send(res, 500, "text/plain; charset=utf-8", "Dev server error: " + ((err && err.message) || err));
    }
  });

  server.on("error", (err) => {
    console.error(`family dev: cannot listen on port ${port} — ${err.message}`);
    process.exitCode = 1;
  });

  server.listen(port, () => {
    console.log(`Mock host ready → http://localhost:${port}`);
    console.log(
      "App iframe → " +
        (/^https?:\/\//i.test(appUrl) ? appUrl : `http://localhost:${port}${appUrl}`)
    );
  });
}

function send(res, status, type, body) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function serveAppFile(res, serveDir, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, "text/plain; charset=utf-8", "Not found: /app/" + path.relative(serveDir, filePath));
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") {
    // Non-entry TS (deep-linked); the entry itself is always bundled.
    const src = fs.readFileSync(filePath, "utf8");
    const { code } = await transform(src, {
      loader: ext === ".tsx" ? "tsx" : "ts",
      format: "esm",
    });
    send(res, 200, "application/javascript; charset=utf-8", code);
    return;
  }
  send(res, 200, MIME[ext] ?? "application/octet-stream", fs.readFileSync(filePath));
}

export function renderHostPage({ appUrl, shareBps }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Family dev host</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; background: #0b0b10; color: #e6e6ef; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
  #bar { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 8px 12px; background: #16161f; border-bottom: 1px solid #2a2a3a; }
  #bar .title { font-weight: 700; color: #A78BFA; }
  #bar label { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  #bar input[type="text"] { background: #0f0f16; color: #e6e6ef; border: 1px solid #2a2a3a; border-radius: 4px; padding: 3px 6px; font: inherit; }
  #wallet { width: 24em; }
  #appid { width: 12em; }
  #scopes { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; }
  button { background: #26263a; color: #e6e6ef; border: 1px solid #3a3a55; border-radius: 4px; padding: 3px 8px; font: inherit; cursor: pointer; }
  button:hover { background: #33334d; }
  #balance { color: #7ee787; }
  #lastcharge { color: #f7b731; }
  details { flex-basis: 100%; }
  summary { cursor: pointer; color: #9a9ab5; }
  pre { margin: 6px 0 0; padding: 8px; background: #0f0f16; border: 1px solid #2a2a3a; border-radius: 4px; max-height: 180px; overflow: auto; }
  #app { flex: 1 1 auto; width: 100%; border: 0; background: #fff; }
  #chromehead { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #16161f; border-bottom: 1px solid #2a2a3a; position: relative; }
  #chromehead[hidden] { display: none; }
  #chromehead .chromehead-text { min-width: 0; flex: 1; display: flex; flex-direction: column; }
  #chrometitle { color: #e6e6ef; font-size: 13px; }
  #chrometitle[hidden], #chromesubtitle[hidden], #chromeback[hidden] { display: none; }
  #chromesubtitle { color: #9a9ab5; font-size: 11px; }
  #chromeprogressrow { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: #0f0f16; }
  #chromeprogressrow[hidden] { display: none; }
  #chromeprogress { height: 100%; background: #A78BFA; transition: width .2s; }
  #chromefoot { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: #16161f; border-top: 1px solid #2a2a3a; }
  #chromefoot[hidden] { display: none; }
  #chromemain { background: #A78BFA; color: #12121a; border: none; border-radius: 8px; padding: 10px; font: inherit; font-weight: 700; cursor: pointer; }
  #chromesecondary { background: #26263a; color: #e6e6ef; border: 1px solid #3a3a55; border-radius: 8px; padding: 10px; font: inherit; cursor: pointer; }
  #chromemain[hidden], #chromesecondary[hidden] { display: none; }
  #chromemain:disabled, #chromesecondary:disabled { opacity: .5; cursor: default; }
  #toast { position: fixed; right: 16px; bottom: 16px; padding: 10px 14px; border-radius: 6px; background: #26263a; color: #fff; border: 1px solid #3a3a55; opacity: 0; transition: opacity .2s; pointer-events: none; max-width: 340px; }
  #toast.show { opacity: 1; }
  #toast.success { background: #14532d; }
  #toast.error { background: #7f1d1d; }
</style>
</head>
<body>
<div id="bar">
  <span class="title">Family dev host</span>
  <label>Wallet <input id="wallet" type="text" /></label>
  <label>App ID <input id="appid" type="text" value="dev.app" /></label>
  <span id="balance">Balance: 1,337.42 USDG (fake)</span>
  <span id="scopes"></span>
  <button id="resetstore" type="button">Reset store</button>
  <label><input id="askcharge" type="checkbox" checked /> Ask before charging</label>
  <span id="lastcharge">No charges yet</span>
  <details>
    <summary id="storesummary">Store (0 keys)</summary>
    <pre id="storejson">{}</pre>
  </details>
</div>
<div id="chromehead" hidden>
  <button id="chromeback" type="button" hidden>&larr;</button>
  <div class="chromehead-text">
    <strong id="chrometitle" hidden></strong>
    <span id="chromesubtitle" hidden></span>
  </div>
  <div id="chromeprogressrow" hidden><div id="chromeprogress"></div></div>
</div>
<iframe id="app" title="Family app" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>
<div id="chromefoot" hidden>
  <button id="chromesecondary" type="button" hidden></button>
  <button id="chromemain" type="button" hidden></button>
</div>
<div id="toast"></div>
<script>
(function () {
  "use strict";

  var APP_URL = ${JSON.stringify(appUrl)};
  var SHARE_BPS = ${JSON.stringify(shareBps)};
  var SCOPES = ${JSON.stringify(SCOPES)};
  var DEFAULT_WALLET = ${JSON.stringify(DEFAULT_WALLET)};

  var iframe = document.getElementById("app");
  var walletInput = document.getElementById("wallet");
  var appIdInput = document.getElementById("appid");
  var lastChargeEl = document.getElementById("lastcharge");
  var storeSummary = document.getElementById("storesummary");
  var storeJson = document.getElementById("storejson");
  var toastEl = document.getElementById("toast");
  var askCharge = document.getElementById("askcharge");
  var toastTimer = null;
  var store = new Map();

  // --- chrome (host-rendered header / action buttons) ---
  var chromeHead = document.getElementById("chromehead");
  var chromeBack = document.getElementById("chromeback");
  var chromeTitle = document.getElementById("chrometitle");
  var chromeSubtitle = document.getElementById("chromesubtitle");
  var chromeProgressRow = document.getElementById("chromeprogressrow");
  var chromeProgress = document.getElementById("chromeprogress");
  var chromeFoot = document.getElementById("chromefoot");
  var chromeMain = document.getElementById("chromemain");
  var chromeSecondary = document.getElementById("chromesecondary");
  var chromeState = {
    header: {},
    back: false,
    main: { text: "", isVisible: false, isActive: true, isProgressVisible: false },
    secondary: { text: "", isVisible: false, isActive: true, isProgressVisible: false },
  };

  function drawChromeButton(el, st) {
    el.hidden = !st.isVisible;
    el.disabled = !st.isActive || st.isProgressVisible;
    el.textContent = st.isProgressVisible ? "Working…" : st.text;
  }

  function renderChrome() {
    var h = chromeState.header;
    var headVisible =
      chromeState.back || h.title || h.subtitle || typeof h.progress === "number";
    chromeHead.hidden = !headVisible;
    chromeBack.hidden = !chromeState.back;
    chromeTitle.hidden = !h.title;
    chromeTitle.textContent = h.title || "";
    chromeSubtitle.hidden = !h.subtitle;
    chromeSubtitle.textContent = h.subtitle || "";
    var hasProgress = typeof h.progress === "number";
    chromeProgressRow.hidden = !hasProgress;
    chromeProgress.style.width = Math.round((h.progress || 0) * 100) + "%";

    chromeFoot.hidden = !(chromeState.main.isVisible || chromeState.secondary.isVisible);
    drawChromeButton(chromeMain, chromeState.main);
    drawChromeButton(chromeSecondary, chromeState.secondary);
  }

  function pushChromeEvent(event) {
    iframe.contentWindow.postMessage(
      { namespace: "family-sdk", type: "FAMILY:EVENT", id: "evt_" + Date.now(), payload: { event: event } },
      "*"
    );
  }

  chromeMain.addEventListener("click", function () { pushChromeEvent("mainButtonClicked"); });
  chromeSecondary.addEventListener("click", function () { pushChromeEvent("secondaryButtonClicked"); });
  chromeBack.addEventListener("click", function () { pushChromeEvent("backButtonClicked"); });

  // Handles every chrome.* method; returns undefined when the method is not
  // part of the chrome namespace so route() can fall through.
  function routeChrome(method, args) {
    if (method === "chrome.ready") return { ok: true };
    if (method === "chrome.close") { toast("App requested close", "info"); return { ok: true }; }
    if (method === "chrome.theme.get") {
      return {
        colorScheme: "dark", bgColor: "#0b0b10", textColor: "#e6e6ef",
        hintColor: "#9a9ab5", buttonColor: "#A78BFA", buttonTextColor: "#ffffff",
      };
    }
    if (method === "chrome.header.setParams") {
      chromeState.header = Object.assign({}, chromeState.header, args[0] || {});
      renderChrome();
      return { ok: true };
    }
    if (method === "chrome.backButton.show") { chromeState.back = true; renderChrome(); return { ok: true }; }
    if (method === "chrome.backButton.hide") { chromeState.back = false; renderChrome(); return { ok: true }; }
    if (method.indexOf("chrome.haptic.") === 0) return { ok: true };
    var slot = null;
    var action = null;
    ["chrome.mainButton", "chrome.secondaryButton"].forEach(function (prefix) {
      if (method.indexOf(prefix + ".") === 0) {
        slot = prefix === "chrome.mainButton" ? "main" : "secondary";
        action = method.slice(prefix.length + 1);
      }
    });
    if (!slot || !action) return undefined;
    var btn = chromeState[slot];
    switch (action) {
      case "setParams": Object.assign(btn, args[0] || {}); break;
      case "show": btn.isVisible = true; break;
      case "hide": btn.isVisible = false; break;
      case "enable": btn.isActive = true; break;
      case "disable": btn.isActive = false; break;
      case "showProgress": btn.isProgressVisible = true; break;
      case "hideProgress": btn.isProgressVisible = false; break;
      default: return undefined;
    }
    renderChrome();
    return { ok: true };
  }

  walletInput.value = DEFAULT_WALLET;
  iframe.src = APP_URL;

  // --- scope checkboxes (checked = granted) ---
  var scopesEl = document.getElementById("scopes");
  SCOPES.forEach(function (scope) {
    var label = document.createElement("label");
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = scope;
    cb.checked = true;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + scope));
    scopesEl.appendChild(label);
  });

  function grantedScopes() {
    var out = [];
    scopesEl.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      if (cb.checked) out.push(cb.value);
    });
    return out;
  }

  // --- store inspector ---
  function refreshStore() {
    var snapshot = {};
    store.forEach(function (rec, key) { snapshot[key] = rec; });
    storeSummary.textContent = "Store (" + store.size + " keys)";
    storeJson.textContent = store.size ? JSON.stringify(snapshot, null, 2) : "{}";
  }
  document.getElementById("resetstore").addEventListener("click", function () {
    store.clear();
    refreshStore();
    toast("Store reset", "info");
  });

  // --- toast ---
  function toast(message, type) {
    toastEl.textContent = String(message);
    toastEl.className = type === "success" || type === "error" ? "show " + type : "show";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = ""; }, 3000);
  }

  // --- charge split math ---
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  function effectiveShareBps() {
    return Math.max(Number(SHARE_BPS) || 1000, 500);
  }
  function computeSplit(amountStr) {
    var gross = Number(amountStr);
    if (!isFinite(gross) || gross <= 0) throw new Error("invalid charge amount: " + amountStr);
    var platform = round6(gross * 0.10);
    var net = round6(gross - platform);
    var family = round6(net * effectiveShareBps() / 10000);
    var developer = round6(net - family);
    return { gross: String(gross), platform: String(platform), family: String(family), developer: String(developer) };
  }

  function handleCharge(input) {
    input = input || {};
    var split = computeSplit(input.amount);
    if (askCharge.checked) {
      var approved = window.confirm(
        "Charge " + split.gross + " " + (input.currency || "") + " — " + (input.item || "") + "\n\n" +
        "Split:\n" +
        "  platform:  " + split.platform + "\n" +
        "  family:    " + split.family + " (" + effectiveShareBps() + " bps of net)\n" +
        "  developer: " + split.developer + "\n\n" +
        "Approve this charge?"
      );
      if (!approved) return { ok: false, error: "Charge declined by user" };
    }
    var result = {
      ok: true,
      chargeId: "dev_" + Date.now(),
      txHash: "0x" + "0".repeat(64),
      split: split
    };
    lastChargeEl.textContent =
      "Last charge: " + split.gross + " " + (input.currency || "") + " (id " + result.chargeId + ")";
    return result;
  }

  // --- postMessage bridge (family-sdk protocol) ---
  function reply(source, id, payload, error) {
    var msg = { namespace: "family-sdk", type: "FAMILY:CALL:RESPONSE", id: id };
    if (error) msg.error = error;
    else msg.payload = payload;
    // Origin may be "null" (sandboxed iframe) — replies go to the frame only.
    source.postMessage(msg, "*");
  }

  function route(method, args) {
    var chromeResult = routeChrome(method, args);
    if (chromeResult !== undefined) return chromeResult;
    switch (method) {
      case "init":
        return {
          ok: true,
          hostVersion: "dev-1.0.0",
          supported: true,
          launchToken: "dev." + Math.random().toString(36).slice(2)
        };
      case "getContext":
        return { mode: "user", wallet: walletInput.value, appId: appIdInput.value };
      case "getPermissions":
        return grantedScopes();
      case "identity.getMe":
        return { wallet: walletInput.value, name: "dev.any", avatarUrl: null, role: "holder", balance: "0" };
      case "store.get": {
        var key = String(args[0]);
        var rec = store.get(key);
        return rec
          ? { key: key, value: rec.value, updatedBy: rec.updatedBy, updatedAt: rec.updatedAt }
          : { key: key, value: null, updatedBy: null, updatedAt: null };
      }
      case "store.set": {
        var k = String(args[0]);
        store.set(k, { value: args[1], updatedBy: walletInput.value, updatedAt: new Date().toISOString() });
        refreshStore();
        return { ok: true, key: k };
      }
      case "store.delete": {
        var deleted = store.delete(String(args[0])) ? 1 : 0;
        refreshStore();
        return { ok: true, deleted: deleted };
      }
      case "store.list": {
        var prefix = args[0] ? String(args[0]) : "";
        var out = [];
        store.forEach(function (rec, key) {
          if (!prefix || key.indexOf(prefix) === 0) {
            out.push({ key: key, updatedBy: rec.updatedBy, updatedAt: rec.updatedAt });
          }
        });
        return out;
      }
      case "payments.charge":
        return handleCharge(args[0]);
      case "storage.upload": {
        var file = args[0];
        var blob = (typeof Blob !== "undefined" && file instanceof Blob)
          ? file
          : new Blob([typeof file === "string" ? file : JSON.stringify(file)]);
        return { ok: true, url: URL.createObjectURL(blob), cid: "dev-cid" };
      }
      case "ui.toast":
        toast(args[0], args[1]);
        return { ok: true };
      case "ui.modal": {
        var opts = args[0] || {};
        return window.confirm((opts.title || "") + "\n\n" + (opts.body || ""));
      }
      default:
        throw new Error("unknown method: " + method);
    }
  }

  window.addEventListener("message", function (event) {
    if (event.source !== iframe.contentWindow) return;
    var data = event.data;
    if (!data || data.namespace !== "family-sdk" || data.type !== "FAMILY:CALL") return;
    var method = data.payload && data.payload.method;
    var args = (data.payload && data.payload.args) || [];
    try {
      reply(event.source, data.id, route(method, args));
    } catch (err) {
      reply(event.source, data.id, null, (err && err.message) || String(err));
    }
  });

  refreshStore();
  renderChrome();
})();
</script>
</body>
</html>`;
}
