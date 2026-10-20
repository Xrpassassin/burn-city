// Retention: streak math + rewards, coin hunt validation, daily seed determinism, rewards not buyable.
const fs = require('fs'), path = require('path'), os = require('os');
Object.assign(process.env, { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'bcret-')), TOKEN_SECRET: 'sim' });
const R = require('../server/retain'), Pay = require('../server/payments'), LB = require('../server/leaderboard'), { items } = require('../server/shop');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const A = 'rSimStreakAcct1111111111111111', realNow = Date.now; let off = 0; Date.now = () => realNow() + off;
for (let d = 0; d < 7; d++) { off = d * 864e5; R.streak(A); R.streak(A); }
ok(R.streak(A).n === 7, '7 consecutive days (repeat visits same day do not double count)');
ok(Pay.owned(A).includes('skin_streak7'), '7-day reward granted to the wallet');
ok(Pay.sdb.prepare("SELECT hash FROM owned WHERE acct=? AND item='skin_streak7'").get(A).hash === 'reward:streak7', 'reward flagged as reward in owned table');
off += 3 * 864e5; ok(R.streak(A).n === 1, 'missed days reset the streak'); ok(R.streak(A).best === 7, 'best kept');
off = 0; const B = 'rSimHuntAcct22222222222222222', wk = LB.week();
ok(R.hunt(B, '2020-W01', 0, 60).error === 'invalid', 'old week rejected'); ok(R.hunt(B, wk, 7, 60).error === 'invalid', 'bad coin rejected'); ok(R.hunt(B, wk, 0, 2).error === 'invalid', 'no time on page rejected');
ok(R.hunt(B, wk, 0, 60).got.length === 1, 'first coin accepted'); ok(R.hunt(B, wk, 1, 61).error === 'too_fast', 'rapid second find rejected');
let last; for (let i = 1; i < 5; i++) { off += 20e3; last = R.hunt(B, wk, i, 100 + i * 20); }
ok(last.got.length === 5 && last.granted[0] === 'drone_burncoin', 'all 5 coins grant drone skin'); ok(Pay.owned(B).includes('drone_burncoin'), 'drone skin owned');
const d1 = R.daily('2026-10-14'), d2 = R.daily('2026-10-14'); ok(d1.seed === d2.seed && d1.mod.id === d2.mod.id, 'daily seed/mod identical for everyone');
const r1 = R.rng(d1.seed), r2 = R.rng(d1.seed); ok([1, 2, 3].every(() => r1() === r2()), 'seeded rng deterministic');
ok(Object.values(items).filter(i => i.reward).every(i => i.drops === 0), 'reward items are free, not sold');
R.recordDaily({ acct: A, kills: 999, wave: 1, secs: 10 }); R.recordDaily({ acct: B, kills: 12, wave: 3, secs: 120 });
const top = R.dailyTop(); ok(top.length === 1 && top[0].best === 195, 'daily board: cheater flagged out, legit score listed');
ok(!JSON.stringify(top).includes(B), 'daily board shows shortened address only');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
