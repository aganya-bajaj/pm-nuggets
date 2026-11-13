// Sends tonight's nugget to every saved phone subscription.
const webpush = require("web-push");
const N = require("../nuggets.json");

const CAT = { sense: "Product Sense", metrics: "Metrics", strategy: "Strategy", exec: "Execution", est: "Estimation", behav: "Behavioral" };
const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
let subs = [];
try { const s = JSON.parse(process.env.PUSH_SUBSCRIPTIONS || "[]"); subs = Array.isArray(s) ? s : [s]; }
catch (e) { console.error("PUSH_SUBSCRIPTIONS is not valid JSON"); process.exit(1); }
if (!subs.length) { console.log("No subscriptions saved yet. Nothing to send."); process.exit(0); }

webpush.setVapidDetails("mailto:pm-nuggets@users.noreply.github.com", pub, priv);

// Rotate through the deck: a different nugget each night (IST date).
const ist = new Date(Date.now() + 5.5 * 3600e3);
const day = Math.floor(ist.getTime() / 86400e3);
const i = day % N.length, x = N[i];
const payload = JSON.stringify({
  title: "2 min of PM prep",
  body: `Tonight: ${x.t} · ${CAT[x.c]}`,
  url: `./?n=${i}`
});

(async () => {
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification(s, payload, { TTL: 3600 * 3, urgency: "high" }); ok++; }
    catch (e) { console.error("Send failed:", e.statusCode, e.body || e.message); }
  }
  console.log(`Sent nugget #${i} "${x.t}" to ${ok}/${subs.length} device(s).`);
  if (!ok) process.exit(1);
})();
