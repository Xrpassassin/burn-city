// Circle of XRPL Memes server: scoring, quadrants, Alpha List exclusion, name safety, fail-soft refresh, route + kill switch.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
const Score = require('./memes-circle-score');
const MC = require('./memes-circle');

const DAY = 864e5, now = Date.parse('2026-11-27T20:00:00Z');
let seq = 0;
const tok = (o = {}) => { seq++; const iss = 'r' + String(seq).padStart(4, '0') + 'aaaaaaaaaaaaaaaaaaaaaaaaa'.slice(0, 25);
  return { issuer: iss, currency: 'T' + seq, name: 'T' + seq, tags: ['Memes'], md5: 'a'.repeat(32), marketcap: 1e5, tvl: 2e4, holders: 1000, vol7dxrp: 5000, top10: 20,
    creatorHoldingPercent: 0, insiderPct: 0, lpBurnedPercent: 50, buyerPressure: 1, creatorTokenCount: 1, creatorLastAction: null, holders24h: 0, pro7d: 0, pro24h: 0, AMM: 'rBudi9ArACZzLrReUWKFZmHve13LD7CbrM', ...o }; };

// percentiles: ties share, range 0..100
assert.deepStrictEqual(Score.percentiles([1, 2, 3]), [0, 50, 100]);
assert.deepStrictEqual(Score.percentiles([5, 5]), [50, 50]);

// holder health moves the right way
const base = Score.holderHealth(tok(), now).hh;
assert.ok(Score.holderHealth(tok({ top10: 90 }), now).hh < base - 15, 'concentration lowers health');
assert.ok(Score.holderHealth(tok({ creatorHoldingPercent: 40 }), now).hh < base - 10, 'creator share lowers health');
assert.ok(Score.holderHealth(tok({ lpBurnedPercent: 100 }), now).hh > base, 'burned LP raises health');
const exit = Score.holderHealth(tok({ creatorLastAction: { side: 'sell', time: now - 2 * DAY } }), now);
assert.ok(exit.flags.includes('creator_recent_exit') && exit.hh < base - 8, 'recent creator sell is flagged');
assert.ok(!Score.holderHealth(tok({ creatorLastAction: { side: 'sell', time: now - 200 * DAY } }), now).flags.includes('creator_recent_exit'), 'old sells are not "recent"');
assert.ok(Score.holderHealth(tok({ tvl: 100, marketcap: 1e6 }), now).flags.includes('thin_liquidity'));

// quadrants
assert.strictEqual(Score.quadrant(80, 70, false), 'kings');
assert.strictEqual(Score.quadrant(20, 70, false), 'grinders');
assert.strictEqual(Score.quadrant(80, 30, false), 'degens');
assert.strictEqual(Score.quadrant(20, 30, false), 'watchline');
assert.strictEqual(Score.quadrant(90, 30, true), 'watchline', 'severe signals override market strength');

// full score: universe size, sorting, Watchline excluded from the Alpha ranks, labels for duplicate names
const raw = [];
for (let i = 0; i < 200; i++) raw.push(tok({ marketcap: 1e4 * (i + 1), tvl: 500 * (i + 1), holders: 50 * (i + 1), vol7dxrp: 100 * ((i * 37) % 200), pro7d: (i % 13) - 6, top10: 10 + (i * 7) % 85, creatorHoldingPercent: i % 23 === 0 ? 45 : 0 }));
raw.push(tok({ name: 'ARMY', marketcap: 5e6, tvl: 4e5, holders: 22000 }), tok({ name: 'ARMY', marketcap: 4e6, tvl: 3e5, holders: 20000 }));
raw.push(tok({ name: '<img src=x onerror=alert(1)>', currency: '3C696D673E000000000000000000000000000000', marketcap: 9e6, tvl: 9e5, holders: 30000 }));
raw.push(tok({ name: 'NOTMEME', tags: ['Utility'], marketcap: 1e9, tvl: 1e8, holders: 1e6 }));
raw.push(raw[0]);   // duplicate row from a second page
const out = Score.score(raw, now);
assert.strictEqual(out.tokens.length, 150, 'top 150');
assert.ok(!out.tokens.some(t => t.name === 'NOTMEME'), 'non-Memes rows dropped');
assert.strictEqual(new Set(out.tokens.map(t => t.key)).size, 150, 'deduped');
const sum = Object.values(out.counts).reduce((a, b) => a + b, 0); assert.strictEqual(sum, 150);
for (const q of Score.QUADS) assert.ok(out.counts[q] > 0, 'every quadrant used: ' + q);
const ranked = out.tokens.filter(t => t.rank != null);
assert.ok(ranked.every(t => t.q !== 'watchline'), 'Watchline never ranked');
assert.ok(out.tokens.filter(t => t.q === 'watchline').every(t => t.rank == null));
for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].alpha >= ranked[i].alpha && ranked[i].rank === i + 1, 'alpha order');
const armies = out.tokens.filter(t => t.name === 'ARMY'); assert.strictEqual(armies.length, 2); assert.ok(armies.every(t => /^ARMY \(r\d{3}\)$/.test(t.label)), 'duplicate names get an issuer suffix');
const evil = out.tokens.find(t => t.mcap === 9e6); assert.ok(evil && /^[A-Za-z0-9 ._\u00B7$-]+$/.test(evil.name) && !/[<>]/.test(evil.label), 'markup names never reach the client');
for (const t of out.tokens) { assert.ok(t.ms >= 0 && t.ms <= 100 && t.hh >= 0 && t.hh <= 100 && t.mom >= 0 && t.mom <= 100); assert.ok(Math.abs(t.alpha - (.5 * t.ms + .35 * t.hh + .15 * t.mom)) < .2); }

(async () => {
  const fakeRes = () => { const r = { code: 0, headers: {}, body: '', writeHead(c, h) { this.code = c; Object.assign(this.headers, h || {}); }, end(b) { this.body = b || ''; } }; return r; };
  const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const call = (q = '', headers = {}) => { const res = fakeRes(); const url = new URL('http://x/api/memes-circle' + q); const handled = MC.handle({ headers }, res, url, { json }); return { handled, res, j: res.body ? JSON.parse(res.body) : null }; };
  assert.strictEqual(MC.handle({ headers: {} }, fakeRes(), new URL('http://x/api/other'), { json }), false, 'other routes pass through');
  // warming up
  let r = call(); assert.ok(r.handled && r.res.code === 503 && r.j.error === 'warming_up');
  // refresh: all pages fail -> no cache, fail soft
  MC._setFetch(async () => { throw new Error('down'); });
  assert.strictEqual(await MC.refresh({ gap: 0 }), false); assert.strictEqual(call().res.code, 503);
  // refresh ok
  const pages = [raw.slice(0, 100), raw.slice(100, 205)];
  let n = 0; MC._setFetch(async () => ({ ok: true, json: async () => ({ tokens: pages[(n++) % 2] }) }));
  assert.strictEqual(await MC.refresh({ gap: 0 }), true);
  r = call(); assert.strictEqual(r.res.code, 200); assert.strictEqual(r.j.tokens.length, 150); assert.ok(/xrpl\.to/.test(r.j.attribution)); assert.ok(r.res.headers.etag);
  assert.strictEqual(call('', { 'if-none-match': r.res.headers.etag }).res.code, 304, 'etag revalidation');
  assert.strictEqual(call('?top=15').j.tokens.length, 15);
  assert.ok(fs.existsSync(path.join(process.env.DATA_DIR, 'memes-circle.json')), 'saved to the data volume');
  // a later failed refresh keeps the last good list
  MC._setFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  assert.strictEqual(await MC.refresh({ gap: 0 }), false); assert.strictEqual(call().res.code, 200, 'stale data still served');
  // kill switch
  process.env.MEMES_CIRCLE = '0'; r = call(); assert.ok(r.handled && r.j.enabled === false && r.res.code === 200); assert.strictEqual(await MC.refresh({ gap: 0 }), false); assert.strictEqual(MC.start(), false);
  delete process.env.MEMES_CIRCLE;
  // server wiring: route sits after the shared per-IP limiter, and the module starts with the server
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const lim = srv.indexOf("    if (limited(ip)) return json(res, 429, { error: 'slow_down' });\n"), route = srv.indexOf('MemesCircle.handle(');
  assert.ok(lim > 0 && route > lim, '/api/memes-circle is behind limited(ip)'); assert.ok(/MemesCircle\.start\(\)/.test(srv));
  MC._reset();
  console.log('memes-circle server tests ok');
})().catch(e => { console.error(e); process.exit(1); });
