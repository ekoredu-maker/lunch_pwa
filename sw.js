// 앱 화면 파일을 저장해 두었다가 빠르게 여는 서비스 워커.
// 파일을 고쳐서 다시 올릴 때는 아래 VERSION 숫자를 하나 올려 주세요.
const VERSION = 'v1';
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
  }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
});
