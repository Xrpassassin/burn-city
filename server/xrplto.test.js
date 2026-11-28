// xrpl.to shared client: optional X-Api-Key (never leaked), one daily budget with priority eco > memes > nft, spacing,
// Retry-After / daily-limit back-off for every module, persistence across restarts, and every caller routed through it.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'xk-'));
process.env.XRPLTO_GAP_MS = '0'; process.env.XRPLMETA_GAP_MS = '0';
delete process.env.XRPLTO_API_KEY; delete process.env.XRPLTO_DAILY_BUDGET;
const X = require('./xrplto');
const KEY = 'test-key-123456';
const hdr = o => ({ get: k => (o || {})[k.toLowerCase()] ?? null });
const resp = (status = 200, h = {}, body = '{}') => ({ ok: status < 400, status, headers: hdr(h), text: async () => body, json: async () => JSON.parse(body) });

// key header
assert.strictEqual(X.keyed(), false);
assert.deepStrictEqual(X.headers({ a: '1' }), { a: '1' }, 'unset: no key header');
process.env.XRPLTO_API_KEY = '   '; assert.strictEqual(X.keyed(), false, 'blank counts as unset');
process.env.XRPLTO_API_KEY = KEY; assert.deepStrictEqual(X.headers({ a: '1' }), { a: '1', 'X-Api-Key': KEY });
delete process.env.XRPLTO_API_KEY;

// every server file that talks to api.xrpl.to goes through the shared client (no direct fetch), and never logs the key
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !/\.test\.js$|^xrplto\.js$/.test(f))) {
  const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
  if (/api\.xrpl\.to/.test(s)) assert.ok(/require\('\.\/xrplto'\)/.test(s) && /XrplTo\.request\(/.test(s), f + ' calls api.xrpl.to without XrplTo.request');
  assert.ok(!/console\.\w+\([^)]*XRPLTO_API_KEY/.test(s), f + ' must not log the key');
}

(async () => {
  let calls = []; X._setFetch(async (u, o) => { calls.push({ u, h: o.headers }); return resp(200, { 'x-ratelimit-daily-remaining': '300' }); });
  X._reset();
  // anonymous: no key header; keyed: header sent
  await X.request('https://api.xrpl.to/a', { prio: 'eco' }); assert.ok(!('X-Api-Key' in calls[0].h));
  process.env.XRPLTO_API_KEY = KEY; await X.request('https://api.xrpl.to/b', { prio: 'eco' }); assert.strictEqual(calls[1].h['X-Api-Key'], KEY);
  assert.ok(!JSON.stringify(X.stats()).includes(KEY)); delete process.env.XRPLTO_API_KEY;

  // budget + priority: with budget 70, nft stops at 10, memes at 55, eco at 70; denied calls never hit the network
  X._reset(); process.env.XRPLTO_DAILY_BUDGET = '70'; calls = []; X._setFetch(async u => { calls.push({ u }); return resp(200); });
  const spend = async (prio, k) => { let ok = 0, denied = 0; for (let i = 0; i < k; i++) { try { await X.request('u', { prio }); ok++; } catch (e) { assert.strictEqual(e.code, 'budget'); denied++; } } return { ok, denied }; };
  assert.deepStrictEqual(await spend('nft', 20), { ok: 10, denied: 10 });
  assert.deepStrictEqual(await spend('memes', 60), { ok: 45, denied: 15 });
  assert.deepStrictEqual(await spend('eco', 20), { ok: 15, denied: 5 });
  assert.strictEqual(calls.length, 70); let st = X.stats(); assert.deepStrictEqual(st.used, { eco: 15, memes: 45, nft: 10 }); assert.strictEqual(st.total, 70);
  delete process.env.XRPLTO_DAILY_BUDGET;

  // the count survives a restart (persisted on the data volume)
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'xrplto-budget.json'), 'utf8')); assert.strictEqual(saved.used.memes, 45);
  delete require.cache[require.resolve('./xrplto')]; const X2 = require('./xrplto'); assert.strictEqual(X2.stats().total, 70, 'reloaded count');
  // ... but a new UTC day starts fresh
  saved.day = '2000-01-01'; fs.writeFileSync(path.join(process.env.DATA_DIR, 'xrplto-budget.json'), JSON.stringify(saved));
  delete require.cache[require.resolve('./xrplto')]; const X3 = require('./xrplto'); assert.strictEqual(X3.stats().total, 0, 'day roll');
  X3.markRun('eco-pass', 1234); assert.strictEqual(X3.lastRun('eco-pass'), 1234);

  // 429 with Retry-After: every module pauses (no network) until it passes
  X._reset(); calls = []; X._setFetch(async u => { calls.push(u); return resp(429, { 'retry-after': '120' }, '{"error":"Too many requests"}'); });
  await assert.rejects(X.request('u', { prio: 'eco' }), e => e.code === 'http_429');
  for (const p of ['eco', 'memes', 'nft']) await assert.rejects(X.request('u', { prio: p }), e => e.code === 'cooldown');
  assert.strictEqual(calls.length, 1); st = X.stats(); const cd = Date.parse(st.cooldownUntil) - Date.now(); assert.ok(cd > 100e3 && cd <= 121e3, 'Retry-After honoured');
  // daily-limit 429: pause for hours
  X._reset(); X._setFetch(async () => resp(429, {}, '{"error":"Anonymous daily request limit reached"}'));
  await assert.rejects(X.request('u', { prio: 'eco' }), e => e.code === 'http_429'); assert.ok(Date.parse(X.stats().cooldownUntil) - Date.now() > 3600e3, 'daily 429 pauses for hours');
  // x-ratelimit-daily-remaining from xrpl.to tightens our own count (other traffic from the IP)
  X._reset(); X._setFetch(async () => resp(200, { 'x-ratelimit-daily-remaining': '8' }));
  await X.request('u', { prio: 'eco' }); await assert.rejects(X.request('u', { prio: 'eco' }), e => e.code === 'budget');

  // one call at a time, highest priority first, >= gap apart
  X._reset(); process.env.XRPLTO_GAP_MS = '30'; const order = []; X._setFetch(async u => { order.push([u, Date.now()]); return resp(200); });
  const ps = [X.request('nft1', { prio: 'nft' }), X.request('nft2', { prio: 'nft' }), X.request('memes', { prio: 'memes' }), X.request('eco', { prio: 'eco' })];
  await Promise.all(ps); assert.deepStrictEqual(order.map(o => o[0]), ['nft1', 'eco', 'memes', 'nft2'], 'queued calls go by priority');
  for (let i = 1; i < order.length; i++) assert.ok(order[i][1] - order[i - 1][1] >= 25, 'spaced');
  // nft gives up instead of waiting behind a long queue
  const q = [X.request('a', { prio: 'eco' }), X.request('b', { prio: 'eco' }), X.request('c', { prio: 'eco' })];
  await assert.rejects(X.request('n', { prio: 'nft', maxQueue: 2 }), e => e.code === 'busy'); await Promise.all(q);
  process.env.XRPLTO_GAP_MS = '0';

  // memes + eco status carry `keyed` and the budget, never the key
  X._reset(); X._setFetch(async () => resp(200));
  const MC = require('./memes-circle'), XM = require('./xrplmeta'); XM._setFetch(async () => resp(404)); MC._setRpc(async () => ({}));
  const json = (res, code, j) => { res.code = code; res.j = j; };
  const call = qs => { const res = { writeHead() {}, end() {} }; MC.handle({ headers: {} }, res, new URL('http://x/api/memes-circle' + qs), { json }); return res; };
  process.env.XRPLTO_API_KEY = KEY;
  let s1 = call('?status=1'); assert.strictEqual(s1.code, 200); assert.strictEqual(s1.j.keyed, true); assert.ok(s1.j.xrplto && typeof s1.j.xrplto.total === 'number');
  assert.ok(!JSON.stringify(s1.j).includes(KEY)); assert.strictEqual(call('').j.keyed, true);
  const Eco = require('./eco'); assert.strictEqual(Eco.status().keyed, true); assert.ok(!JSON.stringify(Eco.status()).includes(KEY)); assert.ok(Eco.status().xrplto);
  delete process.env.XRPLTO_API_KEY; assert.strictEqual(call('?status=1').j.keyed, false); assert.strictEqual(Eco.status().keyed, false);
  MC._reset();
  console.log('xrplto shared client tests ok');
})().catch(e => { console.error(e); process.exit(1); });
