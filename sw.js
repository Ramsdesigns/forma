// פורמה עובדת גם בלי רשת (בחדר כושר במרתף, למשל).
// הדף עצמו: קודם רשת, ואם אין — מהמטמון. קבצים עם hash ותמונות הדגמה: קודם מטמון.
const VERSION = "forma-20261012233904";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isDemo = url.hostname === "raw.githubusercontent.com" && url.pathname.includes("free-exercise-db");
  if (url.origin !== location.origin && !isDemo) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ── תזכורות (Web Push). הטקסט מגיע מהשרת מתבניות קבועות, בלי ערכים בריאותיים. ──
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = {};
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "פורמה", {
      body: d.body || "",
      tag: d.tag || "forma",
      lang: "he",
      dir: "rtl",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
      data: { url: d.url || "./#today", t: d.t || "", api: d.api || "" },
    }),
  );
});

// לחיצה על התראה. "+כוס מים": אם האפליקציה פתוחה היא רושמת בעצמה; אם לא, השרת שומר את הכוס
// בתיבה והאפליקציה אוספת אותה בפתיחה הבאה. בלי אסימון התחברות ב-worker: רק האסימון החתום מההתראה.
self.addEventListener("notificationclick", (e) => {
  const data = e.notification.data || {};
  const water = e.action === "water";
  e.notification.close();
  const report = (a) =>
    data.api && data.t
      ? fetch(data.api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "act", t: data.t, a }) }).catch(() => {})
      : Promise.resolve();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      if (water) {
        if (wins.length) {
          wins[0].postMessage({ type: "forma:water", ml: 250 });
          return report("open");
        }
        return report("water");
      }
      const url = new URL(data.url || "./#today", self.registration.scope).href;
      const open = wins.length ? wins[0].focus().then((w) => (w && "navigate" in w ? w.navigate(url).catch(() => {}) : undefined)) : self.clients.openWindow(url);
      return Promise.all([open, report("open")]);
    }),
  );
});
