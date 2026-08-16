/* 卖设计 · 手机工作台 Service Worker
 * 作用：让 PWA 可安装 + 支持离线/弱网（缓存应用外壳）。
 * 更新策略：静态资源用 network-first（每次拉最新代码，避免被旧缓存困住），
 *           仅离线时回退缓存；URL 带 ?v= 版本号，改版即换新 URL，配合清理旧缓存。
 */
const CACHE = 'wb-mobile-v4';
const CORE = [
  './',
  'index.html',
  'manifest.json',
  'styles-mobile-v2.css',
  'app.js',
  'solarlunar.min.js',
  'phone-bg.jpg',
  'brand-title.png',
  'ima-qr.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨域请求（JSONBin、外部接口等）走浏览器原生网络，不缓存
  if (url.origin !== self.location.origin) return;

  // 页面导航：network-first，离线时回退到缓存的 index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 同域静态资源：network-first（网页版每次拉最新代码，避免被旧缓存困住）；
  // 仅当网络失败（离线）时回退到缓存。命中网络的成功响应仍写入缓存作离线兜底。
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
