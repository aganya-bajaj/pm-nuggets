const VAPID_PUBLIC = "BIrsJbLqvQVZYTgOFl-v67xLPxj_b-SDyDZeuAUU81dTTK4b2bd5lOqlrJBb8X88KngMfpMDumVYhMA4tebjcRI";
const CATS = {
  sense: { n: "Product Sense", c: "--c-sense" },
  metrics: { n: "Metrics & Analytics", c: "--c-metrics" },
  strategy: { n: "Strategy", c: "--c-strategy" },
  exec: { n: "Execution", c: "--c-exec" },
  est: { n: "Estimation", c: "--c-est" },
  behav: { n: "Behavioral", c: "--c-behav" }
};
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let N = [], done = new Set(store.get("pmNuggetsDone_v1", [])), filter = "all", cur = -1, tick = null;
const save = () => store.set("pmNuggetsDone_v1", [...done]);

/* ---------- deck ---------- */
function chips() {
  const el = $("chips");
  const all = [["all", "All"], ...Object.entries(CATS).map(([k, v]) => [k, v.n])];
  el.innerHTML = all.map(([k, n]) => `<button class="chip" aria-pressed="${k === filter}" data-k="${k}">${n}</button>`).join("");
  el.querySelectorAll(".chip").forEach(b => b.onclick = () => { filter = b.dataset.k; chips(); render(); });
}
function render() {
  $("list").innerHTML = N.map((x, i) => ({ x, i })).filter(o => filter === "all" || o.x.c === filter).map(({ x, i }) => `
  <button class="card ${done.has(i) ? "done" : ""}" data-i="${i}">
    <span class="stripe" style="background:var(${CATS[x.c].c})"></span>
    <span><div class="t">${x.t}</div><div class="m">${CATS[x.c].n} · 2 min</div></span>
    <span class="ck">${done.has(i) ? "✓" : ""}</span>
  </button>`).join("");
  $("list").querySelectorAll(".card").forEach(b => b.onclick = () => open(+b.dataset.i));
  $("count").textContent = `${done.size}/${N.length}`;
  $("barFill").style.width = (done.size / N.length * 100) + "%";
  $("nextLbl").textContent = done.size === 0 ? "Start: first nugget" : done.size === N.length ? "All done. Random review" : "Continue: next unread nugget";
}
function nextUnread(from) {
  const pool = N.map((x, i) => i).filter(i => filter === "all" || N[i].c === filter);
  const after = pool.filter(i => i > from && !done.has(i));
  if (after.length) return after[0];
  const any = pool.filter(i => !done.has(i));
  if (any.length) return any[0];
  return pool[Math.floor(Math.random() * pool.length)];
}
function open(i) {
  cur = i; const x = N[i], cat = CATS[x.c];
  $("rTag").textContent = cat.n; $("rTag").style.color = `var(${cat.c})`;
  $("rBody").innerHTML = `<h2>${x.t}</h2>${x.b}
  <div class="drill"><div class="lbl">Try it · 30 sec</div><div>${x.q}</div>
  <button class="reveal" id="revealBtn">Think first, then show a model answer</button>
  <div class="ans" id="ans" hidden>${x.a}</div></div>
  <div class="actions"><button class="b-done" id="doneBtn">${done.has(i) ? "Done ✓ · Next" : "Mark done · Next"}</button><button class="b-next" id="skipBtn">Skip</button></div>`;
  $("revealBtn").onclick = e => { $("ans").hidden = false; e.target.hidden = true; };
  $("doneBtn").onclick = () => { done.add(cur); save(); render(); open(nextUnread(cur)); };
  $("skipBtn").onclick = () => open(nextUnread(cur));
  $("reader").hidden = false; $("reader").scrollTop = 0;
  startTimer();
}
function startTimer() {
  clearInterval(tick); let s = 120; const t = $("timer");
  const f = () => { t.textContent = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "Time's up"; }; f();
  tick = setInterval(() => { s--; f(); if (s <= 0) clearInterval(tick); }, 1000);
}
$("closeBtn").onclick = () => { $("reader").hidden = true; clearInterval(tick); render(); history.replaceState(null, "", "./"); };
$("nextBtn").onclick = () => open(nextUnread(-1));

/* ---------- reminders ---------- */
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let reg = null;

function b64ToU8(s) {
  const p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
function panel(h, s, html, on) {
  $("rH").textContent = h; $("rS").textContent = s; $("rBodyBox").innerHTML = html || ""; $("rPill").hidden = !on;
}
async function drawReminder() {
  if (isIOS && !standalone) {
    return panel("Install to get 11 PM reminders", "iPhone only sends reminders to installed apps.",
      `<ol><li>Tap the Share button in Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Open <b>PM Nuggets</b> from your home screen and come back here.</li></ol>`);
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return panel("Reminders not supported here", "Open this page in Chrome on Android, or install it to your iPhone home screen.");
  }
  if (Notification.permission === "denied") {
    return panel("Notifications are blocked", "Allow notifications for PM Nuggets in your phone settings, then reopen the app.");
  }
  reg = reg || await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) {
    panel("Nightly reminder at 11 PM", "One nugget, every night, with this app's own icon.",
      `<button class="btn" id="enableBtn">Turn on 11 PM reminder</button>`);
    $("enableBtn").onclick = enable;
    return;
  }
  const code = JSON.stringify(sub.toJSON());
  if (!store.get("pmSetupSent", false)) {
    panel("One last step", "Copy this setup code and paste it to Claude in your chat. You only do this once.",
      `<textarea id="codeBox" readonly>${code}</textarea>
       <div class="btns"><button class="btn" id="copyBtn">Copy setup code</button><button class="btn ghost" id="sentBtn">I've sent it</button></div>`, true);
    $("copyBtn").onclick = async () => {
      try { await navigator.clipboard.writeText(code); $("copyBtn").textContent = "Copied"; }
      catch (e) { $("codeBox").focus(); $("codeBox").select(); $("copyBtn").textContent = "Selected. Copy it manually"; }
    };
    $("sentBtn").onclick = () => { store.set("pmSetupSent", true); drawReminder(); };
    return;
  }
  panel("Nightly reminder is on", "You'll get one nugget every night at 11 PM.",
    `<div class="btns"><button class="btn ghost" id="testBtn">Send a test now</button><button class="btn ghost" id="showBtn">Show setup code</button></div>`, true);
  $("testBtn").onclick = () => reg.showNotification("2 minutes of PM prep", {
    body: "This is how your 11 PM reminder will look.", icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "test"
  });
  $("showBtn").onclick = () => { store.set("pmSetupSent", false); drawReminder(); };
}
async function enable() {
  $("enableBtn").disabled = true; $("enableBtn").textContent = "Asking for permission…";
  try {
    const p = await Notification.requestPermission();
    if (p !== "granted") return drawReminder();
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID_PUBLIC) });
  } catch (e) {
    $("rS").textContent = "Couldn't turn on reminders: " + e.message;
  }
  drawReminder();
}

/* ---------- boot ---------- */
(async () => {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  N = await (await fetch("nuggets.json")).json();
  chips(); render();
  const n = parseInt(new URLSearchParams(location.search).get("n"), 10);
  if (n >= 0 && n < N.length) open(n);
  drawReminder().catch(() => {});
})();
