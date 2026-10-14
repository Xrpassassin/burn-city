// Burn City service worker.
// - vendor/ (three.js r160, version-pinned) and icons: cache-first.
// - Everything else on our origin (HTML, app code, data.js, data/*.json): NETWORK-FIRST,
//   cache only used when offline -> nightly data refresh and new code always win when online.
// - Live feed (wss://) and GoatCounter are never touched by the SW.
const VERSION = 'bc-v9v';
const SHELL = `${VERSION}-shell`, RUNTIME = `${VERSION}-runtime`;
const PRECACHE = ['./', 'index.html', 'style.css', 'data.js', 'burned.js', 'launchpad.js', 'ads.js', 'manifest.webmanifest',
  'js/app.js', 'js/estate.js', 'js/drone.js', 'js/live.js', 'js/net.js', 'js/pwa.js', 'js/extras.js', 'js/city.js', 'js/nftchar.js', 'js/nftpick.js', 'js/fx2.js', 'js/retain.js', 'js/debug.js', 'js/replay.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'vendor/three/build/three.module.min.js',
  ...['controls/OrbitControls.js','objects/Reflector.js','postprocessing/BokehPass.js','postprocessing/EffectComposer.js',
    'postprocessing/MaskPass.js','postprocessing/OutputPass.js','postprocessing/Pass.js','postprocessing/RenderPass.js',
    'postprocessing/ShaderPass.js','postprocessing/UnrealBloomPass.js','shaders/BokehShader.js','shaders/CopyShader.js',
    'shaders/LuminosityHighPassShader.js','shaders/OutputShader.js','utils/BufferGeometryUtils.js'].map(p => 'vendor/three/examples/jsm/' + p)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION + '-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const isImmutable = u => u.pathname.includes('/vendor/') || u.pathname.includes('/icons/');
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin) return;
  if (u.pathname.includes('/music/') && !u.pathname.endsWith('.json')) return; // audio: streamed straight from network, never cached // CDN, analytics, ledger: straight to network
  if (isImmutable(u)) {
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => r || fetch(req).then(res => {
      if (res.ok) { const c = res.clone(); caches.open(RUNTIME).then(x => x.put(req, c)); } return res; })));
    return;
  }
  e.respondWith(fetch(req, {cache: 'no-cache'}).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(RUNTIME).then(x => x.put(req, c)); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
