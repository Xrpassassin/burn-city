// Retention: daily streak, weekly BURN-coin hunt, daily zombie challenge (seed/mods + own leaderboard).
// Rewards are FREE cosmetics written to the same `owned` table with hash 'reward:<why>' (non-transferable: tied to the account).
const Pay = require('./payments'), S = require('./store'), LB = require('./leaderboard');
const db = Pay.sdb;
db.exec(`CREATE TABLE IF NOT EXISTS streak(acct TEXT PRIMARY KEY, last TEXT, n INTEGER, best INTEGER);
CREATE TABLE IF NOT EXISTS hunt(acct TEXT, week TEXT, coin INTEGER, t INTEGER, PRIMARY KEY(acct, week, coin));`);
const day = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const grant = (acct, item, why) => db.prepare('INSERT OR IGNORE INTO owned VALUES(?,?,?,?)').run(acct, item, 'reward:' + why, Date.now()).changes > 0;
function streak(acct) {
  const r = db.prepare('SELECT * FROM streak WHERE acct=?').get(acct) || { acct, last: null, n: 0, best: 0 }, t = day(), y = day(Date.now() - 864e5);
  if (r.last !== t) { r.n = r.last === y ? r.n + 1 : 1; r.last = t; r.best = Math.max(r.best, r.n); db.prepare('INSERT OR REPLACE INTO streak VALUES(?,?,?,?)').run(acct, r.last, r.n, r.best); }
  const got = [];
  if (r.best >= 7 && grant(acct, 'skin_streak7', 'streak7')) got.push('skin_streak7');
  if (r.best >= 30 && grant(acct, 'flame_streak30', 'streak30')) got.push('flame_streak30');
  return { n: r.n, best: r.best, day: t, granted: got };
}
// coin hunt: loose anti-script checks (current week only, >=15 s between finds, coin index 0..4, and the client must report a plausible time on page)
function hunt(acct, wk, coin, pageSecs) {
  if (wk !== LB.week() || !(coin >= 0 && coin < 5) || !(pageSecs >= 10)) return { error: 'invalid' };
  const last = db.prepare('SELECT MAX(t) m FROM hunt WHERE acct=? AND week=?').get(acct, wk).m || 0;
  if (Date.now() - last < 15e3) return { error: 'too_fast' };
  db.prepare('INSERT OR IGNORE INTO hunt VALUES(?,?,?,?)').run(acct, wk, coin | 0, Date.now());
  const got = db.prepare('SELECT coin FROM hunt WHERE acct=? AND week=?').all(acct, wk).map(r => r.coin);
  const granted = got.length >= 5 && grant(acct, 'drone_burncoin', 'hunt-' + wk) ? ['drone_burncoin'] : [];
  return { week: wk, got, granted };
}
const huntGot = (acct) => db.prepare('SELECT coin FROM hunt WHERE acct=? AND week=?').all(acct, LB.week()).map(r => r.coin);
// daily challenge: same seed + modifiers for everyone per UTC day
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const MODS = [{ id: 'swift', name: 'Swift dead', sp: 1.25, hp: 1 }, { id: 'tank', name: 'Iron hide', sp: 1, hp: 1.4 }, { id: 'horde', name: 'Horde night', sp: 1.1, hp: 1.15 }, { id: 'glass', name: 'Glass cannons', sp: 1.35, hp: .75 }];
function daily(d = day()) { const seed = hash('bc-daily-' + d); return { day: d, seed, mod: MODS[seed % MODS.length] }; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// same anti-cheat flags as the weekly board, separate file per UTC day
function recordDaily(r) {
  if (!r.acct || r.secs < 5) return; const d = r.day || day(), file = `lbd_${d}.json`, lb = S.load(file, {}), e = lb[r.acct] || { best: 0, kills: 0, wave: 0, runs: 0, flags: [] };
  const score = r.kills * 10 + r.wave * 25, kpm = r.kills / (r.secs / 60);
  if (kpm > 30) e.flags.push('kpm ' + kpm.toFixed(1)); if (r.kills > 6 * r.wave + 2 * r.wave * (r.wave + 1)) e.flags.push('kills>spawned');
  if (score > e.best) { e.best = score; e.kills = r.kills; e.wave = r.wave; } e.runs++; e.flags = e.flags.slice(-10); lb[r.acct] = e; S.save(file, lb);
}
const dailyTop = (d = day(), n = 10) => Object.entries(S.load(`lbd_${d}.json`, {})).filter(([, e]) => !e.flags.length).map(([acct, e]) => ({ acct: acct.slice(0, 6) + '…' + acct.slice(-4), best: e.best, kills: e.kills, wave: e.wave })).sort((a, b) => b.best - a.best).slice(0, n);
module.exports = { streak, hunt, huntGot, daily, rng, recordDaily, dailyTop, day };
