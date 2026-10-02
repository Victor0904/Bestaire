// Service worker : cache de l'application et des planches photo, notifications push.
const CACHE = 'bestiaire-v2';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.webmanifest']))) });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;     // jamais les appels Supabase/Stripe
  if (u.pathname.includes('/planches/') || u.pathname.includes('/assets/') || u.pathname.includes('/icons/')) {
    // fichiers versionnés : le cache d'abord (instantané), le réseau sinon
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)) } return res })));
  } else {
    // page : le réseau d'abord (mises à jour), le cache si le réseau est lent (> 3 s) ou absent
    e.respondWith(new Promise(resolve => {
      let done = false; const fallback = () => caches.match(e.request).then(r => r || caches.match('./index.html'));
      const t = setTimeout(() => fallback().then(r => { if (r && !done) { done = true; resolve(r) } }), 3000);
      fetch(e.request).then(res => { clearTimeout(t); if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)) } if (!done) { done = true; resolve(res) } })
        .catch(() => { clearTimeout(t); fallback().then(r => { if (!done) { done = true; resolve(r || Response.error()) } }) });
    }));
  }
});

// ---- Notifications push ----
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Bestiaire', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Bestiaire', {
    body: d.body || '', icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: d.tag || 'bestiaire', renotify: true,
    data: { tab: d.tab || 'safari' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL('./', self.registration.scope); url.searchParams.set('onglet', (e.notification.data && e.notification.data.tab) || 'safari');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'open-tab', tab: e.notification.data && e.notification.data.tab }); return c.focus() }
    return self.clients.openWindow(url.href);
  }));
});
