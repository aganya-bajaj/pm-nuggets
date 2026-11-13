/* PM Nuggets app shell.
   All tabs, content and reminders come from content/config.json in the GitHub repo.
   The app keeps the last synced copy on the phone and falls back to the copy bundled in the APK. */
"use strict";

const REMOTE = "https://raw.githubusercontent.com/aganya-bajaj/pm-nuggets/main/content/";
const BUNDLED = "content/";
const APP_VERSION = "1.0";
const REMIND_DAYS = 30;          // how many nights ahead each reminder is scheduled
const AUTO_SYNC_MIN = 30;        // re-sync on resume if the last sync is older than this

const capx = window.capacitorExports;
const native = !!(capx && capx.Capacitor && capx.Capacitor.isNativePlatform());
const LN = native ? capx.registerPlugin("LocalNotifications") : null;
const AppPlugin = native ? capx.registerPlugin("App") : null;

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------------- content: bundled, cached, synced ---------------- */
let content = null;            // { config: string, files: {name: string}, syncedAt: number|null, from: "bundled"|"synced" }
let config = null;             // parsed config
let syncState = { busy: false, error: null };

const sourcesOf = cfg => [...new Set((cfg.tabs || []).filter(t => t.source).map(t => t.source))];
const fileText = name => (content.files || {})[name];
function fileJSON(name) { try { return JSON.parse(fileText(name)); } catch (e) { return null; } }

async function fetchText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} for ${url.replace(REMOTE, "")}`);
  return r.text();
}
async function loadFrom(base, bust) {
  const q = bust ? `?t=${Date.now()}` : "";
  const cfgText = await fetchText(base + "config.json" + q);
  const cfg = JSON.parse(cfgText);
  if (!Array.isArray(cfg.tabs)) throw new Error("config.json has no tabs list");
  const files = {};
  for (const src of sourcesOf(cfg)) {
    const t = await fetchText(base + src + q);
    if (/\.json$/i.test(src)) JSON.parse(t);      // refuse to save broken JSON
    files[src] = t;
  }
  return { config: cfgText, files };
}
function use(c) {
  content = c;
  config = JSON.parse(c.config);
}

async function sync(manual) {
  if (syncState.busy) return;
  syncState = { busy: true, error: null };
  refreshSyncUI();
  try {
    const fresh = await loadFrom(REMOTE, true);
    const changed = !content || fresh.config !== content.config || JSON.stringify(fresh.files) !== JSON.stringify(content.files);
    const next = { ...fresh, syncedAt: Date.now(), from: "synced" };
    store.set("content:v1", next);
    use(next);
    syncState = { busy: false, error: null };
    if (changed) { renderShell(); toast("New content synced"); }
    else if (manual) toast("Already up to date");
    scheduleReminders();
  } catch (e) {
    syncState = { busy: false, error: navigator.onLine === false ? "You're offline" : e.message };
    if (manual) toast("Sync failed: " + syncState.error);
  }
  refreshSyncUI();
}

function timeAgo(ts) {
  if (!ts) return "never";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
function refreshSyncUI() {
  document.querySelectorAll("[data-sync]").forEach(el => {
    el.innerHTML = syncState.busy ? `<span class="dot"></span>Syncing…`
      : syncState.error ? (content.syncedAt ? `<span class="dot off"></span>Couldn't sync · using copy from ${timeAgo(content.syncedAt)}` : `<span class="dot off"></span>Couldn't sync · using the built-in copy`)
      : `<span class="dot"></span>Synced ${timeAgo(content.syncedAt)}`;
  });
}

/* ---------------- shell + tabs ---------------- */
const ICONS = {
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  code: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`;

const SETTINGS_TAB = { id: "_settings", title: "Settings", icon: "settings", type: "settings" };
const allTabs = () => [...(config.tabs || []), SETTINGS_TAB];
let activeTab = null;

function renderShell() {
  const tabs = allTabs();
  if (!tabs.find(t => t.id === activeTab)) activeTab = store.get("activeTab", null);
  if (!tabs.find(t => t.id === activeTab)) activeTab = tabs[0].id;
  $("tabbar").innerHTML = tabs.map(t =>
    `<button data-tab="${esc(t.id)}" ${t.id === activeTab ? 'aria-current="page"' : ""}>${icon(t.icon)}<span>${esc(t.title)}</span></button>`).join("");
  $("tabbar").querySelectorAll("button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  showTab(activeTab, true);
}

function showTab(id, keepScroll) {
  const tab = allTabs().find(t => t.id === id) || allTabs()[0];
  activeTab = tab.id; store.set("activeTab", activeTab);
  $("tabbar").querySelectorAll("button").forEach(b => {
    if (b.dataset.tab === tab.id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  closeReader();
  const view = $("view");
  view.className = "view"; view.innerHTML = "";
  const r = RENDER[tab.type];
  if (!r) view.innerHTML = `<div class="wrap"><h1>${esc(tab.title)}</h1><p class="empty">This tab uses the type "${esc(tab.type)}", which this app version doesn't know yet. Install the latest APK to see it.</p></div>`;
  else r(tab, view);
  refreshSyncUI();
  if (!keepScroll) window.scrollTo(0, 0);
}

function header(title, sub) {
  return `<h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}<div class="syncline" data-sync></div>`;
}
function missing(tab, view) {
  view.innerHTML = `<div class="wrap">${header(tab.title)}<p class="empty">Couldn't read ${esc(tab.source || "this tab")}. Check the file in GitHub, then sync from Settings.</p></div>`;
}

/* ---------------- tab type: deck ---------------- */
const deckDone = tab => new Set(store.get("done:" + tab.id, []));
const deckSave = (tab, set) => store.set("done:" + tab.id, [...set]);
function unreadQueue(tab) {
  const d = fileJSON(tab.source); if (!d || !Array.isArray(d.items)) return [];
  const done = deckDone(tab);
  return d.items.map((x, i) => ({ ...x, index: i })).filter(x => !done.has(x.index));
}

let reader = { tab: null, deck: null, cur: -1, filter: "all", tick: null };

function renderDeck(tab, view) {
  const d = fileJSON(tab.source);
  if (!d || !Array.isArray(d.items)) return missing(tab, view);
  const cats = d.categories || {};
  const filterKey = "filter:" + tab.id;
  let filter = store.get(filterKey, "all");
  if (filter !== "all" && !cats[filter]) filter = "all";
  view.innerHTML = `<div class="wrap">${header(d.title || tab.title, d.subtitle)}
    <div class="prog"><div class="bar"><i id="barFill"></i></div><b id="count"></b></div>
    <button class="next" id="nextBtn"><span id="nextLbl"></span><span>→</span></button>
    <div class="chips" id="chips" role="toolbar" aria-label="Filter by topic"></div>
    <div class="list" id="list"></div></div>`;
  const draw = () => {
    const done = deckDone(tab);
    const all = [["all", "All"], ...Object.entries(cats).map(([k, v]) => [k, v.name])];
    $("chips").innerHTML = Object.keys(cats).length ? all.map(([k, n]) => `<button class="chip" aria-pressed="${k === filter}" data-k="${esc(k)}">${esc(n)}</button>`).join("") : "";
    $("chips").querySelectorAll(".chip").forEach(b => b.onclick = () => { filter = b.dataset.k; store.set(filterKey, filter); draw(); });
    $("list").innerHTML = d.items.map((x, i) => ({ x, i })).filter(o => filter === "all" || o.x.cat === filter).map(({ x, i }) => {
      const c = cats[x.cat] || {};
      return `<button class="card ${done.has(i) ? "done" : ""}" data-i="${i}" style="--cat:${esc(c.color || "")}">
        <span class="stripe"></span>
        <span><div class="t">${esc(x.title)}</div><div class="m">${esc(c.name || "")}${c.name ? " · " : ""}${d.minutes || 2} min</div></span>
        <span class="ck">${done.has(i) ? "✓" : ""}</span></button>`;
    }).join("");
    $("list").querySelectorAll(".card").forEach(b => b.onclick = () => openItem(tab, +b.dataset.i));
    $("count").textContent = `${done.size}/${d.items.length}`;
    $("barFill").style.width = (done.size / d.items.length * 100) + "%";
    $("nextLbl").textContent = done.size === 0 ? "Start: first nugget" : done.size === d.items.length ? "All done. Random review" : "Continue: next unread";
  };
  draw();
  $("nextBtn").onclick = () => openItem(tab, nextUnread(tab, -1, filter));
  reader.redraw = draw;
  reader.filter = filter;
}
function nextUnread(tab, from, filter) {
  const d = fileJSON(tab.source), done = deckDone(tab);
  const pool = d.items.map((x, i) => i).filter(i => !filter || filter === "all" || d.items[i].cat === filter);
  const after = pool.filter(i => i > from && !done.has(i));
  if (after.length) return after[0];
  const any = pool.filter(i => !done.has(i));
  if (any.length) return any[0];
  return pool[Math.floor(Math.random() * pool.length)];
}
function openItem(tab, i) {
  const d = fileJSON(tab.source); if (!d || !d.items[i]) return;
  reader.tab = tab; reader.cur = i;
  const x = d.items[i], c = (d.categories || {})[x.cat] || {}, done = deckDone(tab);
  const r = $("reader"); r.style.setProperty("--cat", c.color || "");
  $("rTag").textContent = c.name || "";
  $("rBody").innerHTML = `<h2>${esc(x.title)}</h2>${x.body || ""}
    ${x.drill ? `<div class="drill"><div class="lbl">Try it · 30 sec</div><div>${x.drill}</div>
      <button class="reveal" id="revealBtn">Think first, then show a model answer</button>
      <div class="ans" id="ans" hidden>${x.answer || ""}</div></div>` : ""}
    <div class="actions"><button class="b-done" id="doneBtn">${done.has(i) ? "Done ✓ · Next" : "Mark done · Next"}</button><button class="b-next" id="skipBtn">Skip</button></div>`;
  if ($("revealBtn")) $("revealBtn").onclick = e => { $("ans").hidden = false; e.target.hidden = true; };
  $("doneBtn").onclick = () => { const s = deckDone(tab); s.add(i); deckSave(tab, s); remindersDirty = true; if (reader.redraw) reader.redraw(); openItem(tab, nextUnread(tab, i, reader.filter)); };
  $("skipBtn").onclick = () => openItem(tab, nextUnread(tab, i, reader.filter));
  r.hidden = false; r.scrollTop = 0;
  startTimer((d.minutes || 2) * 60);
}
function closeReader() { $("reader").hidden = true; clearInterval(reader.tick); }
function startTimer(total) {
  clearInterval(reader.tick); let s = total; const t = $("timer");
  const f = () => { t.textContent = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "Time's up"; }; f();
  reader.tick = setInterval(() => { s--; f(); if (s <= 0) clearInterval(reader.tick); }, 1000);
}
$("closeBtn").onclick = closeReader;

/* ---------------- tab type: checklist ---------------- */
function renderChecklist(tab, view) {
  const d = fileJSON(tab.source);
  if (!d || !Array.isArray(d.sections)) return missing(tab, view);
  const key = "check:" + tab.id;
  const draw = () => {
    const on = new Set(store.get(key, []));
    const total = d.sections.reduce((n, s) => n + (s.items || []).length, 0);
    view.innerHTML = `<div class="wrap">${header(d.title || tab.title, d.subtitle)}
      <div class="prog"><div class="bar"><i style="width:${total ? on.size / total * 100 : 0}%"></i></div><b>${on.size}/${total}</b></div>
      ${d.sections.map((s, si) => `<h2 class="sec">${esc(s.title)}</h2><div class="checks">${(s.items || []).map((it, ii) => {
        const k = `${si}-${ii}`, c = on.has(k);
        return `<button class="check ${c ? "on" : ""}" data-k="${k}" role="checkbox" aria-checked="${c}"><span class="ck ${c ? "on" : ""}">${c ? "✓" : ""}</span><span class="txt">${esc(it)}</span></button>`;
      }).join("")}</div>`).join("")}
      <p class="note"><button class="btn ghost small" id="resetBtn">Untick everything</button></p></div>`;
    refreshSyncUI();
    view.querySelectorAll(".check").forEach(b => b.onclick = () => {
      const s = new Set(store.get(key, [])); s.has(b.dataset.k) ? s.delete(b.dataset.k) : s.add(b.dataset.k); store.set(key, [...s]); draw();
    });
    let armed = false;
    $("resetBtn").onclick = e => {
      if (!armed) { armed = true; e.target.textContent = "Tap again to untick all"; return; }
      store.set(key, []); draw();
    };
  };
  draw();
}

/* ---------------- tab type: links ---------------- */
function renderLinks(tab, view) {
  const d = fileJSON(tab.source);
  const links = Array.isArray(d) ? d : d && d.links;
  if (!Array.isArray(links)) return missing(tab, view);
  view.innerHTML = `<div class="wrap">${header((d && d.title) || tab.title, d && d.subtitle)}<div class="list">${links.map(l =>
    `<a class="link" href="${esc(l.url)}" target="_blank" rel="noopener"><div class="t">${esc(l.title)}</div>${l.note ? `<div class="n">${esc(l.note)}</div>` : ""}</a>`).join("")}</div></div>`;
}

/* ---------------- tab type: markdown ---------------- */
function renderMarkdown(tab, view) {
  const t = fileText(tab.source);
  if (t == null) return missing(tab, view);
  const html = window.marked ? window.marked.parse(t) : `<pre>${esc(t)}</pre>`;
  view.innerHTML = `<div class="wrap"><div class="syncline" data-sync></div><article class="prose">${html}</article></div>`;
  view.querySelectorAll(".prose a[href^='http']").forEach(a => { a.target = "_blank"; a.rel = "noopener"; });
}

/* ---------------- tab type: html (custom feature, works offline) ---------------- */
function renderHTML(tab, view) {
  const t = fileText(tab.source);
  if (t == null) return missing(tab, view);
  view.className = "view full";
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-same-origin");
  f.title = tab.title; f.srcdoc = t;
  view.appendChild(f);
}

/* ---------------- tab type: web (any URL, needs internet) ---------------- */
function renderWeb(tab, view) {
  if (!tab.url) return missing(tab, view);
  view.className = "view full";
  const f = document.createElement("iframe");
  f.title = tab.title; f.src = tab.url;
  view.appendChild(f);
}

/* ---------------- settings ---------------- */
async function renderSettings(tab, view) {
  const rems = config.reminders || [];
  const off = new Set(store.get("remindersOff", []));
  view.innerHTML = `<div class="wrap"><h1>Settings</h1>
    <h2 class="sec">Content</h2>
    <div class="panel">
      <div class="rowi"><div class="grow"><div class="h">Sync from GitHub</div><div class="s" data-sync></div></div><button class="btn small" id="syncBtn">Sync now</button></div>
      <div class="rowi"><div class="grow"><div class="h">Source</div><div class="s">${esc(REMOTE.replace("https://raw.githubusercontent.com/", "github.com/").replace("/main/", "/ main /"))}</div></div></div>
      <div class="rowi"><div class="grow"><div class="h">Content version</div><div class="s">Config v${esc(config.version || "?")} · ${content.from === "bundled" ? "copy built into the app" : "synced copy"}</div></div></div>
    </div>
    <h2 class="sec">Reminders</h2>
    <div class="panel" id="remPanel">${rems.length ? rems.map(r => `
      <div class="rowi"><div class="grow"><div class="h">${esc(fmtTime(r.time))} · ${esc(r.title)}</div><div class="s">${esc(String(r.body || "").replace("{next}", "next unread nugget"))}${r.enabled === false ? " · turned off in config" : ""}</div></div>
      <button class="switch" role="switch" data-id="${esc(r.id)}" aria-checked="${r.enabled !== false && !off.has(r.id)}" aria-label="${esc(r.title)}" ${r.enabled === false ? "disabled" : ""}></button></div>`).join("")
      : `<div class="rowi"><div class="grow s">No reminders in config.json.</div></div>`}
      <div class="rowi"><div class="grow"><div class="h">Test</div><div class="s">Sends one notification in 5 seconds.</div></div><button class="btn ghost small" id="testBtn">Send test</button></div>
    </div>
    <div id="permBox"></div>
    <p class="note">Some phones (Xiaomi, Oppo, Vivo, Realme, OnePlus) delay alarms to save battery. If a reminder comes late, open Android Settings → Apps → PM Nuggets → Battery and choose <b>Unrestricted</b>.</p>
    <h2 class="sec">About</h2>
    <div class="panel"><div class="rowi"><div class="grow"><div class="h">PM Nuggets ${APP_VERSION}</div><div class="s">Tabs and reminders come from config.json. Your progress stays on this phone.</div></div></div></div>
  </div>`;
  $("syncBtn").onclick = () => sync(true);
  view.querySelectorAll(".switch").forEach(s => s.onclick = () => {
    const o = new Set(store.get("remindersOff", []));
    o.has(s.dataset.id) ? o.delete(s.dataset.id) : o.add(s.dataset.id);
    store.set("remindersOff", [...o]); s.setAttribute("aria-checked", String(!o.has(s.dataset.id)));
    scheduleReminders();
  });
  $("testBtn").onclick = testNotification;
  drawPermissions();
}
async function drawPermissions() {
  const box = $("permBox"); if (!box) return;
  if (!LN) { box.innerHTML = `<p class="note">Reminders work in the installed Android app. This is the browser preview.</p>`; return; }
  let html = "";
  try {
    const p = await LN.checkPermissions();
    if (p.display !== "granted") html += `<div class="rowi"><div class="grow"><div class="h warn">Notifications are off</div><div class="s">Allow them so reminders can show.</div></div><button class="btn small" id="permBtn">Allow</button></div>`;
  } catch (e) {}
  try {
    const x = await LN.checkExactNotificationSetting();
    if (x.exact_alarm !== "granted") html += `<div class="rowi"><div class="grow"><div class="h warn">Exact timing is off</div><div class="s">Without it Android may send reminders late.</div></div><button class="btn small" id="exactBtn">Fix</button></div>`;
  } catch (e) {}
  box.innerHTML = html ? `<div class="panel" style="margin-top:10px">${html}</div>` : "";
  if ($("permBtn")) $("permBtn").onclick = async () => { await LN.requestPermissions(); scheduleReminders(); drawPermissions(); };
  if ($("exactBtn")) $("exactBtn").onclick = async () => { await LN.changeExactNotificationSetting(); setTimeout(drawPermissions, 1500); };
}
function fmtTime(t) {
  const [h, m] = String(t || "").split(":").map(Number);
  if (isNaN(h)) return t || "";
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const RENDER = { deck: renderDeck, checklist: renderChecklist, links: renderLinks, markdown: renderMarkdown, html: renderHTML, web: renderWeb, settings: renderSettings };

/* ---------------- reminders (local, on the phone) ---------------- */
let remindersDirty = false;
const NOTIF_STYLE = { smallIcon: "ic_stat_pm", iconColor: "#F2BB2E", largeIcon: "ic_notif_large", channelId: "reminders" };

async function ensureChannel() {
  try { await LN.createChannel({ id: "reminders", name: "Reminders", description: "Daily prep reminders", importance: 4, visibility: 1, vibration: true }); } catch (e) {}
}
async function scheduleReminders() {
  if (!LN || !config) return;
  try {
    let p = await LN.checkPermissions();
    if (p.display === "prompt" || p.display === "prompt-with-rationale") p = await LN.requestPermissions();
    if (p.display !== "granted") return;
    await ensureChannel();
    const pending = (await LN.getPending()).notifications || [];
    if (pending.length) await LN.cancel({ notifications: pending.map(n => ({ id: n.id })) });

    const off = new Set(store.get("remindersOff", []));
    const list = [], now = new Date();
    (config.reminders || []).forEach((r, ri) => {
      if (r.enabled === false || off.has(r.id)) return;
      const [hh, mm] = String(r.time || "").split(":").map(Number);
      if (isNaN(hh)) return;
      const tab = (config.tabs || []).find(t => t.id === r.tab);
      const queue = tab && tab.type === "deck" ? unreadQueue(tab) : [];
      const first = new Date(now); first.setHours(hh, mm || 0, 0, 0);
      if (first <= now) first.setDate(first.getDate() + 1);
      for (let k = 0; k < REMIND_DAYS; k++) {
        const at = new Date(first); at.setDate(first.getDate() + k);
        const item = queue.length ? queue[k % queue.length] : null;
        const body = String(r.body || "").includes("{next}")
          ? (item ? r.body.replace("{next}", item.title) : (r.fallback || "Open the app for tonight's read."))
          : (r.body || "");
        list.push({ id: (ri + 1) * 1000 + k, title: r.title || config.app?.title || "Reminder", body,
          schedule: { at, allowWhileIdle: true }, extra: { tab: r.tab || null, item: item ? item.index : null }, ...NOTIF_STYLE });
      }
    });
    if (list.length) await LN.schedule({ notifications: list });
    remindersDirty = false;
  } catch (e) { console.warn("Scheduling reminders failed", e); }
}
async function testNotification() {
  if (!LN) return toast("Reminders work in the installed Android app");
  let p = await LN.checkPermissions();
  if (p.display !== "granted") p = await LN.requestPermissions();
  if (p.display !== "granted") return toast("Allow notifications first");
  await ensureChannel();
  const r = (config.reminders || [])[0] || {};
  const tab = (config.tabs || []).find(t => t.id === r.tab);
  const item = tab && tab.type === "deck" ? unreadQueue(tab)[0] : null;
  await LN.schedule({ notifications: [{ id: 999, title: r.title || "Test reminder",
    body: item ? String(r.body || "{next}").replace("{next}", item.title) : "This is how your reminder will look.",
    schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, extra: { tab: r.tab || null, item: item ? item.index : null }, ...NOTIF_STYLE }] });
  toast("Test coming in 5 seconds");
}
function openFromNotification(extra) {
  if (!extra || !extra.tab) return;
  const tab = (config.tabs || []).find(t => t.id === extra.tab);
  if (!tab) return;
  showTab(tab.id);
  if (tab.type === "deck" && extra.item != null) openItem(tab, extra.item);
}

/* ---------------- misc ---------------- */
let toastT = null;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { if (remindersDirty) scheduleReminders(); }
  else if (content && (!content.syncedAt || Date.now() - content.syncedAt > AUTO_SYNC_MIN * 60000)) sync(false);
});

/* ---------------- boot ---------------- */
(async () => {
  const cached = store.get("content:v1", null);
  try {
    if (cached && cached.config) use(cached);
    else use({ ...(await loadFrom(BUNDLED, false)), syncedAt: null, from: "bundled" });
  } catch (e) {
    $("view").innerHTML = `<div class="wrap"><h1>Couldn't start</h1><p class="empty">${esc(e.message)}</p></div>`;
    return;
  }
  renderShell();

  if (LN) {
    LN.addListener("localNotificationActionPerformed", ev => openFromNotification(ev && ev.notification && ev.notification.extra));
    scheduleReminders();
  }
  if (AppPlugin) {
    AppPlugin.addListener("backButton", () => {
      if (!$("reader").hidden) return closeReader();
      const first = allTabs()[0].id;
      if (activeTab !== first) return showTab(first);
      AppPlugin.exitApp();
    });
  }
  sync(false);
  setInterval(refreshSyncUI, 60000);
})();
