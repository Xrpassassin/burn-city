// Shared xrpl.to client: one queue + one daily budget for every server module (eco.js, memes-circle.js, nft.js).
// xrpl.to's anonymous limits are 30 req/min and 333 req/day per IP, shared by everything on the Fly IP, so:
//   - daily budget (UTC day, persisted on the data volume so redeploys don't reset it): XRPLTO_DAILY_BUDGET, default 250
//     anonymous. Priority eco > memes > nft: a lower priority may not eat the reserve kept for the higher ones.
//   - spacing: one call at a time, >= 2.5 s apart (<= 24/min), highest priority first.
//   - 429: honour Retry-After for everyone (else 60 s); a daily-limit 429 (or x-ratelimit-daily-remaining 0) pauses all calls
//     for 2 h (xrpl.to's daily window isn't documented, so we probe at most ~12x/day). x-ratelimit-daily-remaining (trusted
//     for 2 h) also tightens our own count, since other traffic from the Fly IP counts too.
// Denied calls never touch the network: request() throws an Error with .code 'budget' | 'cooldown'.
// Optional XRPLTO_API_KEY (Fly secret): sends `X-Api-Key` and raises the default budget. The key is never logged or returned.
'use strict';
const fs = require('fs'), path = require('path');

const key = () => String(process.env.XRPLTO_API_KEY || '').trim();
const keyed = () => key().length > 0;
function headers(extra = {}) { const k = key(); return k ? { ...extra, 'X-Api-Key': k } : { ...extra }; }

const PRIO = { eco: 0, memes: 1, nft: 2 };
const budget = () => +process.env.XRPLTO_DAILY_BUDGET || (keyed() ? 20000 : 250);
// what each priority may spend: memes leaves 15 for eco, nft leaves 60 for eco + memes
const capFor = p => budget() - (p === 'eco' ? 0 : p === 'memes' ? 15 : 60);
const GAP = () => (process.env.XRPLTO_GAP_MS != null ? +process.env.XRPLTO_GAP_MS : 2500);
const dataDir = () => process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
const FILE = () => path.join(dataDir(), 'xrplto-budget.json');
const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const DAILY_PAUSE = 2 * 3600e3, REMOTE_TTL = 2 * 3600e3;

let S = null, fetchImpl = (...a) => fetch(...a), last = 0, busy = false; const queue = [];
function fresh() { return { day: today(), used: { eco: 0, memes: 0, nft: 0 }, denied: { eco: 0, memes: 0, nft: 0 }, r429: 0, cooldownUntil: 0, remoteRemaining: null, runs: {} }; }
function load() {
  if (S) return S;
  try { S = JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { S = null; }
  if (!S || typeof S !== 'object' || !S.used) S = fresh();
  return roll();
}
function roll() { if (S.day !== today()) { const runs = S.runs || {}, cd = S.cooldownUntil; S = fresh(); S.runs = runs; S.cooldownUntil = cd > Date.now() ? cd : 0; } return S; }
function save() { try { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(FILE(), JSON.stringify(S)); } catch {} }
const total = () => S.used.eco + S.used.memes + S.used.nft;
function deny(prio) {
  load(); roll();
  if (S.cooldownUntil > Date.now()) return 'cooldown';
  const rem = S.remoteRemaining != null && Date.now() - (S.remoteAt || 0) < REMOTE_TTL ? S.remoteRemaining : null;
  const spent = Math.max(total(), rem != null && !keyed() ? 333 - rem : 0);   // remote count includes other traffic from the IP
  if (spent >= capFor(prio) || (!keyed() && rem != null && rem <= 10)) return 'budget';
  return null;
}
function err(code, msg) { const e = new Error(msg || 'xrpl.to ' + code); e.code = code; return e; }
function pump() {
  if (busy || !queue.length) return; busy = true;
  queue.sort((a, b) => a.p - b.p || a.n - b.n); const job = queue.shift();
  const wait = Math.max(0, last + GAP() - Date.now());
  setTimeout(async () => {
    let called = false;
    try { const why = deny(job.prio); if (why) { S.denied[job.prio]++; save(); job.reject(err(why)); return; }
      called = true; last = Date.now(); S.used[job.prio]++; save();
      const r = await fetchImpl(job.url, { headers: headers(job.headers), signal: AbortSignal.timeout(job.timeout) });
      const rem = r.headers && r.headers.get ? r.headers.get('x-ratelimit-daily-remaining') : null;
      if (rem != null && rem !== '' && Number.isFinite(+rem)) { S.remoteRemaining = +rem; S.remoteAt = Date.now(); }
      if (r.status === 429) { S.r429++;
        let body = ''; try { body = await r.text(); } catch {}
        const ra = r.headers && r.headers.get ? +r.headers.get('retry-after') : NaN;
        const daily = /daily/i.test(body) || S.remoteRemaining === 0;
        S.cooldownUntil = Math.max(S.cooldownUntil, daily ? Date.now() + DAILY_PAUSE : Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 60e3));
        save(); job.reject(err('http_429', 'xrpl.to 429' + (daily ? ' (daily limit)' : ''))); return; }
      if (S.remoteRemaining === 0) S.cooldownUntil = Math.max(S.cooldownUntil, Date.now() + DAILY_PAUSE);
      save(); job.resolve(r);
    } catch (e) { job.reject(e); }
    finally { if (called) last = Date.now(); busy = false; pump(); }
  }, wait);
}
let seq = 0;
// request(url, { prio: 'eco'|'memes'|'nft', headers, timeout }) -> Response (any status except 429). Throws .code budget|cooldown|busy|http_429.
function request(url, { prio = 'nft', headers: h = {}, timeout = 20e3, maxQueue = Infinity } = {}) {
  if (!(prio in PRIO)) prio = 'nft';
  const why = deny(prio) || (queue.length >= maxQueue ? 'busy' : null); if (why) { S.denied[prio]++; save(); return Promise.reject(err(why)); }
  return new Promise((resolve, reject) => { queue.push({ url, prio, p: PRIO[prio], n: seq++, headers: h, timeout, resolve, reject }); pump(); });
}
// small persisted "last ran at" marks so scheduled xrpl.to passes survive restarts (Fly redeploys several times a day)
function lastRun(name) { load(); return +(S.runs || {})[name] || 0; }
function markRun(name, t = Date.now()) { load(); (S.runs = S.runs || {})[name] = t; save(); }
function stats() { load(); roll(); return { day: S.day, budget: budget(), used: { ...S.used }, total: total(), denied: { ...S.denied }, r429: S.r429,
  remoteDailyRemaining: S.remoteRemaining, cooldownUntil: S.cooldownUntil > Date.now() ? new Date(S.cooldownUntil).toISOString() : null, queued: queue.length, keyed: keyed() }; }

module.exports = { headers, keyed, request, stats, lastRun, markRun, PRIO,
  _setFetch: f => { fetchImpl = f; }, _reset: () => { S = fresh(); last = 0; queue.length = 0; busy = false; save(); }, _state: () => S };
