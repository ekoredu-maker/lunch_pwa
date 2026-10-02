// 앱 화면 파일을 저장해 두었다가 빠르게 열고, 9시 점심 신청 알림을 띄우는 서비스 워커.
// 파일을 고쳐서 다시 올릴 때는 아래 VERSION 숫자를 하나 올려 주세요.
const VERSION = 'v2';
const CACHE = 'lunch-' + VERSION;
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([...SHELL, LIB])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url === LIB) { // 버전 고정 라이브러리: 캐시 우선
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
  if (url.origin !== location.origin) return; // 수파베이스 데이터 요청은 건드리지 않음
  // 앱 파일: 네트워크 우선 (항상 최신), 오프라인이면 캐시
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});

// ---------- 9시 점심 신청 알림 ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || '오늘 점심 신청', {
    body: d.body || '같이 드실래요? 신청 또는 미신청을 골라 주세요.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'lunch-' + (d.date || ''),        // 같은 날 알림은 하나로 합침
    renotify: true,
    data: { date: d.date },
    actions: [ // 안드로이드에서는 알림에 버튼으로 표시됨 (아이폰은 버튼 없이 앱이 열림)
      { action: 'yes', title: '🍚 신청' },
      { action: 'no', title: '미신청' },
    ],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const date = (e.notification.data && e.notification.data.date) || '';
  const rsvp = e.action === 'yes' || e.action === 'no' ? e.action : '';
  const url = new URL('./', self.registration.scope);
  url.searchParams.set('from', 'push');
  if (rsvp) { url.searchParams.set('rsvp', rsvp); url.searchParams.set('date', date); }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) { // 앱이 이미 열려 있으면 그 화면으로 전환하고 선택 전달
      await win.focus();
      win.postMessage({ type: 'rsvp', rsvp, date });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
