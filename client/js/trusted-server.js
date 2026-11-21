// Shared allowlist for the ?citysrv= / ?api= server overrides (security hardening, sw bc-v184-sec).
// Every page that lets a query param pick the game server MUST resolve it through trustedServer(), because the
// chosen server receives the player's bearer token (Authorization header, WS ?token=) and drives Xaman flows.
//   - page served from localhost / 127.0.0.1 / [::1]: any http(s) origin is accepted (local dev: ?citysrv=http://localhost:8080)
//   - any other page: only this page's own origin or https://burn-city-game.fly.dev; anything else -> the fallback
// Classic-script compatible (sets globalThis.BCTrustedServer, also module.exports for node tests);
// ES modules import it through ./trusted-server.mjs. Based on serverOrigin() in aegis.js.
(function (g) {
  'use strict';
  var DEFAULT_SERVER = 'https://burn-city-game.fly.dev';
  var PROD_HOSTS = ['burn-city-game.fly.dev'];
  var LOOPBACK = ['localhost', '127.0.0.1', '[::1]', '::1'];
  var WALLET_HOST = /^(?:[a-z0-9-]+\.)*(?:xumm\.app|xaman\.app)$/i;
  function here(l) { return l || g.location || null; }
  function isLocalPage(l) { l = here(l); return !!l && LOOPBACK.indexOf(String(l.hostname).toLowerCase()) >= 0; }
  // raw: the query value (may be null). fallback: what to use when it is absent or untrusted. l: location-like {origin, hostname}.
  function trustedServer(raw, fallback, l) {
    if (fallback === undefined) fallback = DEFAULT_SERVER;
    l = here(l);
    if (raw == null || raw === '') return fallback;
    var u;
    try { u = new URL(String(raw), l && l.origin && l.origin !== 'null' ? l.origin : DEFAULT_SERVER); } catch (e) { return fallback; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return fallback;
    if (u.username || u.password) return fallback;
    if (isLocalPage(l)) return u.origin;                                  // local dev: point a local page at any server
    if (l && u.origin === l.origin) return u.origin;                      // the server that served this page
    if (u.protocol === 'https:' && !u.port && PROD_HOSTS.indexOf(u.hostname.toLowerCase()) >= 0) return u.origin;
    return fallback;
  }
  // Xaman QR images and deeplinks: https on xaman.app / xumm.app (or a subdomain) only. Returns the href or null.
  function safeXamanUrl(url) {
    try { var u = new URL(String(url)); return u.protocol === 'https:' && !u.username && !u.password && WALLET_HOST.test(u.hostname) ? u.href : null; }
    catch (e) { return null; }
  }
  var api = { DEFAULT_SERVER: DEFAULT_SERVER, PROD_HOSTS: PROD_HOSTS.slice(), trustedServer: trustedServer, isLocalPage: isLocalPage, safeXamanUrl: safeXamanUrl };
  g.BCTrustedServer = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
