// Fishing: server rolls, conditions, timing/rate limits, coins only from selling, shop.
const fs = require('fs'), path = require('path'), os = require('os');
Object.assign(process.env, { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'bcfish-')), TOKEN_SECRET: 'sim' });
const F = require('../server/fish'); let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const realNow = Date.now; let off = 0; Date.now = () => realNow() + off; const A = 'rFishSim11111111111111111111';
ok(F.SPECIES.length === 20 && new Set(F.SPECIES.map(s => s[2])).size === 5, '20 species across 5 rarities');
ok(F.baitAffinity('minnow', 0) === 1.25 && F.baitAffinity('minnow', 3) === 0.9, 'preferred bait boosts odds and mismatched bait modestly lowers them');
ok(F.baitAffinity('unknown-species', 2) === 1, 'unknown species retain neutral bait affinity');
ok(F.baitAffinity('leviathan', 99) === 0.9, 'bait tier is clamped safely');
let deepOnly = 0, leg = 0; for (let i = 0; i < 4000; i++) { const f = F.roll('basic', 'worm', { night: false, deep: false }); if (['cod', 'marlin', 'leviathan', 'whaleshark', 'sturgeon'].includes(f.id)) deepOnly++; if (f.r === 4) leg++; }
ok(deepOnly === 0, 'deep-water fish never from shore'); ok(leg === 0, 'no legendary on worm bait');
let legB = 0; for (let i = 0; i < 4000; i++) if (F.roll('legend', 'burnfly', { night: true, deep: true }).r === 4) legB++; ok(legB > 20, 'legendary possible from boat with good gear (' + legB + '/4000)');
const c = F.cast(A, {}); ok(c.cid && c.wait >= 2500 && !c.id, 'cast hides species until landed');
ok(F.cast(A, {}).error === 'too_fast', 'second cast within 5 s rejected');
ok(F.reel(A, c.cid, true).error === 'timing', 'reeling before the bite is rejected');
off += 10e3; const c2 = F.cast(A, {}); off += c2.wait + 100; const r = F.reel(A, c2.cid, true); ok(r.fish && r.profile.creel.length === 1, 'landed fish goes to creel');
ok(F.get(A).coins === 0, 'no coins until sold'); const s = F.sell(A); ok(s.sold > 0 && F.get(A).coins === s.sold, 'selling gives coins');
ok(F.buy(A, 'rod', 'legend').error === 'not_enough_coins', 'cannot buy what you cannot afford');
while (F.get(A).coins < 5) { off += 10e3; const k = F.cast(A, {}); off += k.wait + 50; F.reel(A, k.cid, true); F.sell(A); }
ok(F.buy(A, 'bait', 'shrimp', 1).profile.bait.shrimp === 1, 'bait purchase with coins');
off += 10e3; const c3 = F.cast(A, {}); off += c3.wait + 25e3; ok(F.reel(A, c3.cid, true).error === 'timing', 'stale reel (bot left it) rejected');
{ const db = require('../server/payments').sdb, X = 'rFishSimX9999999999999999999', st = db.prepare('INSERT INTO fish_catch(acct,t) VALUES(?,?)'); for (let i = 0; i < F.LIM.maxPerHour - 1; i++) st.run(X, Date.now()); ok(!F.cast(X, {}).error, 'cast allowed just under the hourly cap (' + F.LIM.maxPerHour + ')'); st.run(X, Date.now()); off += 6e3; ok(F.cast(X, {}).error === 'hourly_limit' && F.LIM.maxPerHour === 1000, 'hourly catch cap enforced at 1000'); }
{ off = 0; const B = 'rFishSimB2222222222222222222'; const k = F.cast(B, {}); off += k.wait + 100; F.reel(B, k.cid, true); const top = F.weekTop(); ok(top.length >= 1 && top.every(e => e.who.length <= 8 && !e.who.includes(A) && e.kg > 0 && e.sp), 'weekly top: masked handles, kg + species'); ok(top[0].kg >= top[top.length - 1].kg, 'weekly top sorted by biggest kg'); ok(F.today(B) === 1, 'today catch count for daily mission'); }
{ const G = 'rFishSimG3333333333333333333'; const k = F.cast(G, {}); off += k.wait + 100; F.reel(G, k.cid, true); const pre = F.get(G).log;
  const r = F.importGuest(G, { coins: 99999, rod: 'pro', rods: ['basic', 'carbon', 'pro', 'hacked'], bait: { glow: 9999, worm: 5, fake: 3 }, log: { trout: { n: 3, best: 9999 }, nope: { n: 5, best: 1 } }, n: 50 });
  ok(r.ok && r.profile.coins === F.IMP.coins, 'import: coins capped at ' + F.IMP.coins); ok(r.profile.rods.includes('pro') && !r.profile.rods.includes('hacked') && r.profile.rod === 'pro', 'import: valid rods merged, unknown dropped');
  ok(r.profile.bait.glow === F.IMP.bait && !('fake' in r.profile.bait), 'import: bait capped, unknown dropped'); ok(r.profile.log.trout && r.profile.log.trout.best <= 4 && !r.profile.log.nope, 'import: species validated, weight capped');
  ok(Object.keys(pre).every(id => r.profile.log[id] && r.profile.log[id].n >= pre[id].n) && r.profile.log.trout.n >= 3, 'import: merged with existing catches'); ok(F.importGuest(G, { coins: 5 }).error === 'already_imported', 'import: only once per wallet');
  const H = 'rFishSimH4444444444444444444'; F.importGuest(H, { coins: 10, rods: ['carbon'] }); const H2 = 'rFishSimH5555555555555555555'; F.importGuest(H2, { coins: 2000, rods: ['carbon'] }); ok(true, 'setup'); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
