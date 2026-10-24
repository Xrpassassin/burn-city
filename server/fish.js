// Lake fishing: server-authoritative rolls + sanity limits. Coins are a free in-game score: no real value, never sold for XRP, not withdrawable.
const Pay = require('./payments'), db = Pay.sdb;
db.exec(`CREATE TABLE IF NOT EXISTS fish_prof(acct TEXT PRIMARY KEY, coins INTEGER, rod TEXT, rods TEXT, bait TEXT, log TEXT, creel TEXT, n INTEGER, xp INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS fish_catch(acct TEXT, t INTEGER);`);
try { db.exec('ALTER TABLE fish_prof ADD COLUMN xp INTEGER NOT NULL DEFAULT 0'); } catch (e) { }
for (const c of ['kg REAL', 'sp TEXT']) try { db.exec('ALTER TABLE fish_catch ADD COLUMN ' + c); } catch (e) { }
const SPECIES = [["minnow","Ledger Minnow",0,[0.05,0.3],3,{}],["bluegill","Bluegill Byte",0,[0.1,0.6],4,{}],["perch","Pond Perch",0,[0.2,1.2],5,{}],["carp","Mud Carp",0,[0.8,6],6,{}],["shiner","River Shiner",0,[0.05,0.4],3,{}],["dace","Silver Dace",0,[0.1,0.5],4,{}],["trout","Neon Trout",1,[0.5,4],12,{}],["bass","Amber Bass",1,[0.6,5],14,{}],["catfish","Glass Catfish",1,[1,9],15,{"night":1}],["pike","Spotted Pike",1,[1,8],16,{}],["eel","Moon Eel",2,[0.8,5],40,{"night":1}],["gar","Storm Gar",2,[2,12],45,{"weather":"storm"}],["koi","Gold Koi",2,[1,7],50,{}],["cod","Deepwater Cod",2,[3,20],48,{"deep":1}],["sturgeon","Phantom Sturgeon",3,[10,60],140,{"night":1,"deep":1}],["snapper","Lava Snapper",3,[2,14],120,{}],["salmon","Aurora Salmon",3,[3,18],130,{"weather":"bull"}],["leviathan","Burn Leviathan",4,[80,300],600,{"deep":1,"night":1}],["marlin","Crystal Marlin",4,[40,180],520,{"deep":1}],["whaleshark","XRP Whale Shark",4,[200,900],750,{"deep":1,"weather":"bull"}]], SHOP = {"rods":[["basic","Basic Rod",0,0],["carbon","Carbon Rod",150,1],["pro","Pro Rod",600,2],["legend","Ember Legend Rod",2000,3]], "baits":[["worm","Worm (free)",0,0],["shrimp","Shrimp",5,1],["glow","Glow Lure",20,2],["burnfly","Burn Fly",60,3]]};
const RW = [60, 25, 10, 4, 1];
const ROD_LEVELS = { basic: 1, carbon: 2, pro: 5, legend: 10 };
const XP_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1850, 2400, 3050];
function anglerLevel(xp = 0) {
  const total = Math.max(0, Math.floor(Number(xp) || 0)); let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) { if (total < XP_THRESHOLDS[i]) break; level = i + 1; }
  return level;
}
function xpForCatch(fish = {}) {
  const rarity = Math.max(0, Math.min(4, Math.floor(Number(fish.r) || 0)));
  const kg = Math.max(0, Math.min(30, Number(fish.kg) || 0));
  return Math.round(10 + rarity * 12 + kg);
}
const tier = (list, id) => (list.find(x => x[0] === id) || [0, 0, 0, 0])[3];
// Species-specific preferred bait, applied on the server so signed-in players get the same rules as guests.
const PREFERRED_BAIT = { minnow: 0, bluegill: 0, perch: 0, shiner: 0, dace: 0, carp: 1, catfish: 1, eel: 2, gar: 2, koi: 2, cod: 1, sturgeon: 1, snapper: 3, trout: 3, bass: 3, pike: 3, salmon: 3, leviathan: 2, marlin: 2, whaleshark: 2 };
function baitAffinity(speciesId, baitTier) { const preferred = PREFERRED_BAIT[speciesId]; if (preferred === undefined) return 1; return Math.max(0, Math.min(3, +baitTier || 0)) === preferred ? 1.25 : 0.9; }
function roll(rodId, baitId, ctx, rnd = Math.random) {
  const rt = tier(SHOP.rods, rodId), bt = tier(SHOP.baits, baitId), luck = rt * 0.5 + bt;
  const ok = SPECIES.filter(s => (!s[5].night || ctx.night) && (!s[5].deep || ctx.deep) && (!s[5].weather || s[5].weather === ctx.weather) && !(s[2] === 4 && bt < 2) && !(s[2] === 3 && bt < 1 && rt < 1));
  const w = ok.map(s => RW[s[2]] * Math.pow(1 + luck, s[2] * 0.6) * baitAffinity(s[0], bt)); let x = rnd() * w.reduce((a, b) => a + b, 0), i = 0; while (x > w[i]) x -= w[i++];
  const s = ok[Math.min(i, ok.length - 1)], f = Math.pow(rnd(), Math.max(0.6, 1.6 - 0.25 * rt)), kg = +(s[3][0] + (s[3][1] - s[3][0]) * f).toFixed(2);
  return { id: s[0], name: s[1], r: s[2], kg, val: Math.round(s[4] * (1 + f)), hits: 1 + s[2], zone: +(0.3 - 0.04 * s[2] + 0.05 * rt).toFixed(2) };
}
const get = acct => { const r = db.prepare('SELECT * FROM fish_prof WHERE acct=?').get(acct); return r ? { coins: r.coins, rod: r.rod, rods: JSON.parse(r.rods), bait: JSON.parse(r.bait), log: JSON.parse(r.log), creel: JSON.parse(r.creel), n: r.n, xp: Math.max(0, Number(r.xp) || 0) } : { coins: 0, rod: 'basic', rods: ['basic'], bait: { worm: -1 }, log: {}, creel: [], n: 0, xp: 0 }; };
const put = (acct, p) => db.prepare('INSERT OR REPLACE INTO fish_prof(acct,coins,rod,rods,bait,log,creel,n,xp) VALUES(?,?,?,?,?,?,?,?,?)').run(acct, p.coins, p.rod, JSON.stringify(p.rods), JSON.stringify(p.bait), JSON.stringify(p.log), JSON.stringify(p.creel.slice(-60)), p.n, Math.max(0, Math.floor(Number(p.xp) || 0)));
db.exec('CREATE TABLE IF NOT EXISTS fish_streak(acct TEXT PRIMARY KEY, cur INTEGER, wk INTEGER, wbest INTEGER, wt INTEGER, best INTEGER)');
// server-observed catch streak: consecutive landed fish. Escapes, timeouts and abandoned/spooked casts reset it.
function streakHit(acct, ok) { const ws = weekStart(), r = db.prepare('SELECT * FROM fish_streak WHERE acct=?').get(acct) || { cur: 0, wk: ws, wbest: 0, wt: 0, best: 0 };
  if (r.wk !== ws) { r.wk = ws; r.wbest = 0; r.wt = 0; } r.cur = ok ? r.cur + 1 : 0; if (r.cur > r.wbest) { r.wbest = r.cur; r.wt = Date.now(); } r.best = Math.max(r.best, r.cur);
  db.prepare('INSERT OR REPLACE INTO fish_streak VALUES(?,?,?,?,?,?)').run(acct, r.cur, r.wk, r.wbest, r.wt, r.best); return { cur: r.cur, wbest: r.wbest, best: r.best }; }
const landed = new Map();   // acct -> last landed fish (lets the city channel show other players the real catch)
setInterval(() => { const t = Date.now(); for (const [k, v] of landed) if (t - v.t > 60e3) landed.delete(k); }, 60e3).unref();
const casts = new Map();   // acct -> {cid, fish, t, ready}
const LIM = { minCastMs: 5000, maxPerHour: 1000, reelWindowMs: 20000 };
const phxNight = () => { const h = (new Date().getUTCHours() + 17) % 24; return h >= 19 || h < 6; };
function cast(acct, { bait = 'worm', deep = false, weather = '' } = {}) {
  const now = Date.now(), last = casts.get(acct); if (last && now - last.t < LIM.minCastMs) return { error: 'too_fast' };
  if (db.prepare('SELECT COUNT(*) c FROM fish_catch WHERE acct=? AND t>?').get(acct, now - 3600e3).c >= LIM.maxPerHour) return { error: 'hourly_limit' };
  if (last && now > last.ready) streakHit(acct, false);   // a bite was left unreeled (spooked / walked away)
  const p = get(acct); if (bait !== 'worm' && !(p.bait[bait] > 0)) bait = 'worm';
  const fish = roll(p.rod, bait, { night: phxNight(), deep: !!deep, weather: ['bull', 'storm'].includes(weather) ? weather : '' });
  const wait = 2500 + Math.floor(Math.random() * 6000), cid = Math.random().toString(36).slice(2, 10);
  casts.set(acct, { cid, fish, t: now, ready: now + wait, bait });
  return { cid, wait, hits: fish.hits, zone: fish.zone, r: fish.r };   // species stays secret until landed
}
function reel(acct, cid, ok) {
  const c = casts.get(acct), now = Date.now(); if (!c || c.cid !== cid) return { error: 'no_cast' };
  if (now < c.ready || now > c.ready + LIM.reelWindowMs) { casts.delete(acct); streakHit(acct, false); return { error: 'timing' }; }
  casts.delete(acct); const p = get(acct); if (c.bait !== 'worm') p.bait[c.bait] = Math.max(0, (p.bait[c.bait] || 0) - 1);
  if (!ok) { put(acct, p); streakHit(acct, false); return { escaped: true }; }
  const f = c.fish, L = p.log[f.id] || { n: 0, best: 0 }; L.n++; L.best = Math.max(L.best, f.kg); p.log[f.id] = L; p.creel.push([f.id, f.kg, f.val]); p.n++; p.xp = Math.max(0, Number(p.xp) || 0) + xpForCatch(f);
  landed.set(acct, { id: f.id, kg: f.kg, r: f.r, t: now });
  put(acct, p); db.prepare('INSERT INTO fish_catch(acct,t,kg,sp) VALUES(?,?,?,?)').run(acct, now, f.kg, f.id); return { fish: f, profile: p, today: today(acct), streak: streakHit(acct, true) };
}
function sell(acct) { const p = get(acct), v = p.creel.reduce((a, f) => a + f[2], 0); p.coins += v; p.creel = []; put(acct, p); return { sold: v, profile: p }; }
function buy(acct, kind, id, qty = 1) {
  const p = get(acct), list = kind === 'rod' ? SHOP.rods : SHOP.baits, it = list.find(x => x[0] === id); if (!it) return { error: 'unknown' };
  qty = Math.max(1, Math.min(50, qty | 0)); const cost = kind === 'rod' ? it[2] : it[2] * qty;
  if (kind === 'rod' && p.rods.includes(id)) { p.rod = id; put(acct, p); return { profile: p }; }
  if (p.coins < cost) return { error: 'not_enough_coins' };
  if (kind === 'rod' && anglerLevel(p.xp) < (ROD_LEVELS[id] || 1)) return { error: 'level_locked', level: anglerLevel(p.xp), requiredLevel: ROD_LEVELS[id] || 1 };
  p.coins -= cost;
  if (kind === 'rod') { p.rods.push(id); p.rod = id; } else if (id !== 'worm') p.bait[id] = (p.bait[id] || 0) + qty;
  put(acct, p); return { profile: p };
}
// one-time import of a guest's browser progress into the wallet profile (unverifiable client data -> strict caps, once per wallet, logged)
db.exec('CREATE TABLE IF NOT EXISTS fish_import(acct TEXT PRIMARY KEY, t INTEGER, summary TEXT)');
const IMP = { coins: 2000, bait: 200, logN: 500, total: 2000 };
function importGuest(acct, g) {
  if (db.prepare('SELECT 1 FROM fish_import WHERE acct=?').get(acct)) return { error: 'already_imported' };
  const p = get(acct); if (p.rods.some(r => r !== 'basic')) return { error: 'profile_not_new' };
  if (!g || typeof g !== 'object') return { error: 'invalid' };
  const rodIds = SHOP.rods.map(r => r[0]), baitIds = SHOP.baits.map(b => b[0]), sp = Object.fromEntries(SPECIES.map(x => [x[0], x]));
  const coins = Math.max(0, Math.min(IMP.coins, Math.floor(+g.coins || 0)));
  p.coins = Math.min(IMP.coins, Math.max(p.coins, coins));
  const rods = Array.isArray(g.rods) ? g.rods.filter(r => rodIds.includes(r)) : []; p.rods = [...new Set([...p.rods, ...rods])];
  if (rodIds.includes(g.rod) && p.rods.includes(g.rod)) p.rod = g.rod;
  let baitAdded = 0; if (g.bait && typeof g.bait === 'object') for (const id of baitIds) { if (id === 'worm') continue; const q = Math.max(0, Math.min(IMP.bait, Math.floor(+g.bait[id] || 0))); if (q) { p.bait[id] = Math.min(IMP.bait, (p.bait[id] || 0) + q); baitAdded += q; } }
  let logged = 0; if (g.log && typeof g.log === 'object') for (const [id, L] of Object.entries(g.log)) { const S = sp[id]; if (!S || !L) continue; const n = Math.max(0, Math.min(IMP.logN, Math.floor(+L.n || 0))); if (!n) continue;
    const best = Math.max(0, Math.min(S[3][1], +L.best || 0)), cur = p.log[id] || { n: 0, best: 0 }; p.log[id] = { n: Math.min(IMP.logN, cur.n + n), best: +Math.max(cur.best, best).toFixed(2) }; logged += n; }
  p.n += Math.min(IMP.total, Math.max(0, Math.floor(+g.n || 0)));
  put(acct, p); const summary = { coins: p.coins, rods: p.rods, rod: p.rod, baitAdded, logged, species: Object.keys(p.log).length };
  db.prepare('INSERT INTO fish_import VALUES(?,?,?)').run(acct, Date.now(), JSON.stringify(summary)); console.log('[fish] guest import', acct.slice(0, 4) + '…' + acct.slice(-3), JSON.stringify(summary));
  return { ok: true, summary, profile: p };
}
// weekly leaderboard (UTC Monday start): biggest single catch per wallet, masked handle only
const weekStart = (ms = Date.now()) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5; };
const dayStart = (ms = Date.now()) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };
const mask = a => a.slice(0, 4) + '…' + a.slice(-3);
function weekTop(n = 10) { return db.prepare('SELECT acct, sp, MAX(kg) kg, t FROM fish_catch WHERE t>=? AND kg IS NOT NULL GROUP BY acct ORDER BY kg DESC LIMIT ?').all(weekStart(), n).map(r => ({ who: mask(r.acct), sp: r.sp, kg: r.kg, t: r.t })); }
function streakTop(n = 10) { return db.prepare('SELECT acct, wbest, wt FROM fish_streak WHERE wk=? AND wbest>=2 ORDER BY wbest DESC, wt ASC LIMIT ?').all(weekStart(), n).map(r => ({ who: mask(r.acct), n: r.wbest })); }
const today = acct => db.prepare('SELECT COUNT(*) c FROM fish_catch WHERE acct=? AND t>=?').get(acct, dayStart()).c;
// Rotating daily board: progress is derived from server-recorded catches, never client claims.
const DAILY_TARGETS = ['minnow', 'bluegill', 'perch', 'carp', 'shiner', 'dace', 'trout', 'bass', 'pike', 'koi', 'snapper'];
function challenges(acct, ms = Date.now()) {
  const start = dayStart(ms), day = new Date(start).toISOString().slice(0, 10);
  const dayNumber = Math.floor(start / 864e5), target = DAILY_TARGETS[((dayNumber % DAILY_TARGETS.length) + DAILY_TARGETS.length) % DAILY_TARGETS.length];
  const catches = db.prepare('SELECT sp, kg FROM fish_catch WHERE acct=? AND t>=? AND t<? AND sp IS NOT NULL ORDER BY t').all(acct, start, start + 864e5);
  const unique = new Set(catches.map(c => c.sp)), bestKg = catches.reduce((best, c) => Math.max(best, Number(c.kg) || 0), 0);
  const items = [
    { id: 'daily-three', title: 'Keep the Line Tight', detail: 'Land 3 fish today', progress: Math.min(catches.length, 3), goal: 3 },
    { id: 'daily-target', title: 'Species Spotlight', detail: 'Catch today’s featured species: ' + target, progress: Math.min(catches.filter(c => c.sp === target).length, 1), goal: 1, species: target },
    { id: 'daily-variety', title: 'A Varied Creel', detail: 'Land 2 different species today', progress: Math.min(unique.size, 2), goal: 2 },
    { id: 'daily-heavy', title: 'Heavy Haul', detail: 'Land a fish weighing at least 5 kg today', progress: bestKg >= 5 ? 1 : 0, goal: 1 }
  ].map(item => ({ ...item, unlocked: item.progress >= item.goal }));
  return { day, target, catches: catches.length, items };
}
module.exports = { lastLanded: a => landed.get(a), streakTop, streakHit, importGuest, IMP, weekTop, today, challenges, weekStart, get, cast, reel, sell, buy, roll, baitAffinity, anglerLevel, xpForCatch, ROD_LEVELS, SPECIES, SHOP, LIM, _casts: casts };
