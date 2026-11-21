// Security hardening (sw bc-v184-sec): client-side checks. No browser, no network.
//  - shared ?citysrv= / ?api= allowlist (client/js/trusted-server.js) and the Xaman URL check
//  - HTML escaping of XRPL token names (client/js/safe-html.mjs) and its use at the app.js innerHTML sinks
//  - every page/module that reads ?citysrv= / ?api= goes through the helper
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { trustedServer, isLocalPage, safeXamanUrl, DEFAULT_SERVER } from '../client/js/trusted-server.mjs';
import { escapeHtml, safeTokenName, neutralizeEcoNames } from '../client/js/safe-html.mjs';

const PROD = { origin: 'https://burn-city-game.fly.dev', hostname: 'burn-city-game.fly.dev' };
const GH = { origin: 'https://xrpassassin.github.io', hostname: 'xrpassassin.github.io' };
const LOCAL = { origin: 'http://localhost:18391', hostname: 'localhost' };
const LOOP = { origin: 'http://127.0.0.1:8080', hostname: '127.0.0.1' };

// ---- allowlist ----
assert.equal(DEFAULT_SERVER, 'https://burn-city-game.fly.dev');
assert.equal(trustedServer(null, undefined, PROD), DEFAULT_SERVER, 'absent -> default');
assert.equal(trustedServer('', 'X', PROD), 'X', 'empty -> fallback');
for (const evil of ['https://evil.tld', 'https://127.0.0.1:8443', 'http://burn-city-game.fly.dev', 'https://burn-city-game.fly.dev.evil.tld',
  'https://evil.tld/?x=https://burn-city-game.fly.dev', 'javascript:alert(1)', 'data:text/html,x', '//evil.tld', 'https://user:pw@burn-city-game.fly.dev',
  'https://burn-city-game.fly.dev:8443', 'https://evil-burn-city-game.fly.dev', 'http://localhost:8080', 'https://', 'ftp://burn-city-game.fly.dev'])
  assert.equal(trustedServer(evil, 'FALLBACK', PROD), 'FALLBACK', 'prod page rejects ' + evil);
assert.equal(trustedServer('https://burn-city-game.fly.dev', 'F', GH), 'https://burn-city-game.fly.dev', 'github pages may point at prod');
assert.equal(trustedServer('https://burn-city-game.fly.dev/some/path?q=1', 'F', PROD), 'https://burn-city-game.fly.dev', 'origin only');
assert.equal(trustedServer('https://xrpassassin.github.io', 'F', GH), 'https://xrpassassin.github.io', 'same origin ok');
assert.equal(trustedServer('/', 'F', PROD), 'https://burn-city-game.fly.dev', 'relative -> same origin');
// local dev pages may point anywhere (HANDOFF: ?citysrv=<local origin>)
assert.equal(isLocalPage(LOCAL), true); assert.equal(isLocalPage(LOOP), true); assert.equal(isLocalPage(PROD), false);
assert.equal(isLocalPage({ origin: 'http://127.0.0.2:1', hostname: '127.0.0.2' }), false, 'only the exact loopback names count');
assert.equal(trustedServer('http://localhost:8080', 'F', LOCAL), 'http://localhost:8080');
assert.equal(trustedServer('http://127.0.0.1:9999', 'F', LOCAL), 'http://127.0.0.1:9999');
assert.equal(trustedServer('https://staging.example', 'F', LOOP), 'https://staging.example');
assert.equal(trustedServer('javascript:alert(1)', 'F', LOCAL), 'F', 'local pages still need http(s)');
// classic-script variant is the same object
const require = createRequire(import.meta.url);
assert.equal(require('../client/js/trusted-server.js').trustedServer, trustedServer);
assert.equal(globalThis.BCTrustedServer.trustedServer, trustedServer);

// ---- Xaman URLs ----
assert.equal(safeXamanUrl('https://xumm.app/sign/abc_q.png'), 'https://xumm.app/sign/abc_q.png');
assert.equal(safeXamanUrl('https://xaman.app/detect/abc'), 'https://xaman.app/detect/abc');
for (const bad of ['javascript:alert(1)', 'http://xumm.app/sign/x', 'https://evil.tld/xumm.app', 'https://xumm.app.evil.tld/x', 'https://u:p@xumm.app/x', '', null, undefined, 'data:image/png;base64,AA'])
  assert.equal(safeXamanUrl(bad), null, 'rejects ' + bad);

// ---- token-name escaping ----
const NAME = '<style onload=__X=1>';
assert.equal(escapeHtml(NAME), '&lt;style onload=__X=1&gt;');
assert.equal(escapeHtml(`"'&\``), '&quot;&#39;&amp;&#96;');
assert.equal(escapeHtml(null), ''); assert.equal(escapeHtml('$BURN · IMG'), '$BURN · IMG', 'legit names unchanged');
assert.equal(safeTokenName(NAME), 'style onload=__X=1');
const E = { nodes: [{ name: NAME }, { name: 'BURN' }], pools: [{ a: 'BURN', b: NAME }] };
neutralizeEcoNames(E);
assert.equal(E.nodes[0].name, E.pools[0].b, 'node and pool names stay consistent');
assert(E.nodes.every(n => !/[<>"'&`]/.test(n.name)), 'no markup left in ECO names');
assert.equal(E.nodes[1].name, 'BURN');

// ---- sinks in app.js use the escaper ----
const app = readFileSync('client/js/app.js', 'utf8');
assert.match(app, /const E=neutralizeEcoNames\(window\.ECO\)/, 'ECO names neutralized at ingest');
for (const re of [/el\.innerHTML=escH\(n\.name\)/, /<h2>\$\{escH\(p\.a\)\} ⇄ \$\{escH\(p\.b\)\}<\/h2><table><tr><td>Forever Rails/, /Live trade'\} · \$\{escH\(p\.a\)\} ⇄ \$\{escH\(p\.b\)\}/,
  /\$\{ps\.slice\(0,5\)\.map\(p=>`\$\{escH\(p\.a\)\}⇄\$\{escH\(p\.b\)\}/, /LP LOCKED · \$\{escH\(b\.p\.a\)\} ⇄ \$\{escH\(b\.p\.b\)\}/, /evBanner\(`🏗️ \$\{escH\(ticker\)\} BONDED/])
  assert.match(app, re, 'escaped sink ' + re);
for (const raw of [/el\.innerHTML=n\.name/, /<h2>\$\{p\.a\} ⇄/, /LP LOCKED · \$\{b\.p\.a\}/, /🏗️ \$\{ticker\} BONDED/, /map\(p=>`\$\{p\.a\}⇄/])
  assert.doesNotMatch(app, raw, 'raw token-name sink left: ' + raw);

// ---- every ?citysrv= / ?api= read goes through the helper ----
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = path.join(d, f); if (f === 'vendor' || f === 'node_modules') continue;
  if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js|html)$/.test(f) && !/\.test\.m?js$/.test(f)) files.push(p); } })('client');
const RAW = /\.get\(\s*['"](citysrv|api)['"]\s*\)/g;
for (const f of files) {
  if (f.endsWith(path.join('js', 'trusted-server.js'))) continue;
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(RAW)) {
    const line = src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index));
    assert.match(line, /trustedServer\(/, `${f}: ?${m[1]}= read must go through trustedServer(): ${line.trim().slice(0, 160)}`);
  }
}
// arena: no innerHTML for shop items / QR, deeplinks checked
const arena = readFileSync('client/arena/index.html', 'utf8'), net = readFileSync('client/arena/net.js', 'utf8');
assert.doesNotMatch(arena, /\$\('#shop'\)\.innerHTML/, 'shop renders with DOM APIs');
assert.doesNotMatch(arena, /<img src="\$\{x\.qr\}">/, 'QR is not interpolated into HTML');
assert.doesNotMatch(arena, /location\.href = e\.xaman\.deeplink/);
assert.match(net, /safeXamanUrl\(x\?\.deeplink\)/, 'net.js only follows xaman deeplinks');
console.log('security-hardening (client): ok');
