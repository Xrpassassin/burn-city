// Ranked Light Cycles disconnect scenarios against the real server code (simulated ledger, throwaway wallet, no network sends).
const fs = require('fs'), path = require('path'), os = require('os'), xrpl = require('xrpl');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bctron-')), W = xrpl.Wallet.generate();
Object.assign(process.env, { DATA_DIR: DIR, PORT: '0', RANKED_LIVE: 'true', DRY_RUN: 'false', TREASURY_ADDRESS: W.classicAddress, TREASURY_SEED: W.seed, XAMAN_API_KEY: 'sim', XRPL_WSS: 'ws://127.0.0.1:1', BURN_JOB_IN_SERVER: 'false' });
const R = require('../server/ranked'), Q = require('../server/payq'), Srv = require('../server/server');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const acct = () => xrpl.Wallet.generate().classicAddress, BUY = 5e6, BURN = Math.floor(BUY * 0.0322);
function setup(id, n, cfg = {}) {
  const accts = Array.from({ length: n }, acct); R.lobbies[id] = { id, game: 'tron', cfg, buyin: BUY, creator: accts[0], created: Date.now(), paid: [...accts], state: 'open' };
  const r = Srv.tronRoom({ id, ranked: true, cfg, creatorAcct: accts[0] }), ps = [];
  accts.forEach((a, i) => { const t = 'TK' + id + i; R.tickets[t] = { account: a, match: id, exp: Date.now() + 1e6, used: false, hash: 'H' + id + i, drops: BUY, burn: BURN, paidAt: i };
    const p = { ws: { close() {}, send() {}, readyState: 1 }, acct: a, ticket: t, paidAt: i, name: 'p' + i, ip: '10.0.0.' + i };
    if (cfg.teams) r.setTeam(p, (i % cfg.teams) + 1); p.id = r.add(p); ps.push(p); });
  r.tl.wantStart = ps[0]; for (let i = 0; i < 200 && r.tl.state !== 'live'; i++) Srv.tronTick(r);
  return { r, ps, accts };
}
const leave = (r, p) => { r.tl.left = r.tl.left || {}; r.tl.left[p.acct] = r.t; r.remove(p.id); };
const tick = r => Srv.tronTick(r);
(async () => {
  console.log('Light Cycles: all players disconnect before any round finishes -> refund');
  let { r, ps, accts } = setup('MT1', 3); ok(r.tl.state === 'live', 'match went live with 3 verified tickets');
  ps.forEach((p, i) => { r.t += 1; leave(r, p); }); tick(r);
  ok(!Srv.rooms.tron.includes(r), 'room finalized and removed (not stuck)');
  const st1 = R.payoutStatus('MT1'); ok(st1.status === 'cancelled_refunded' && st1.payouts.length === 3 && st1.payouts.every(p => p.kind === 'refund' && p.xrp === (BUY - BURN) / 1e6), `3 refunds queued at ${(BUY - BURN) / 1e6} XRP (burn kept)`);
  tick(r); ok(R.payoutStatus('MT1').payouts.length === 3, 'no duplicate refunds on later ticks');

  console.log('Light Cycles: all disconnect after a finished round (bo3) -> scored by standing');
  ({ r, ps, accts } = setup('MT2', 3, { bo3: true }));
  r.onRound({ place: new Map([[ps[1].id, 1], [ps[0].id, 2], [ps[2].id, 3]]) });   // round 1: p1 wins
  ok(r.tl.state === 'live' && r.tl.round === 1, 'bo3 still live after round 1');
  r.t += 1; leave(r, ps[2]); r.t += 1; leave(r, ps[0]); r.t += 1; leave(r, ps[1]); tick(r);
  const m2 = R.payoutStatus('MT2'); const rec2 = JSON.parse(fs.readFileSync(path.join(DIR, 'ranked_matches.json')))['MT2'];
  ok(m2.status === 'queued' && rec2.standings[0].acct === accts[1] && rec2.standings[1].acct === accts[0] && rec2.standings[2].acct === accts[2], 'standings: round winner 1st, then round-1 placement');
  const pot = 3 * (BUY - BURN); ok(m2.payouts.length === 3 && Math.abs(m2.payouts[0].xrp / ((pot - 300) / 1e6) - 0.5) < 1e-4, 'paid 50/30/20 automatically via queue');
  ok(!Srv.rooms.tron.includes(r), 'room removed');

  console.log('Light Cycles: partial disconnect mid-match');
  ({ r, ps, accts } = setup('MT3', 3));
  r.t += 60; leave(r, ps[0]); r.onRound({ place: new Map([[ps[2].id, 1], [ps[1].id, 2]]) });
  const rec3 = JSON.parse(fs.readFileSync(path.join(DIR, 'ranked_matches.json')))['MT3'];
  ok(rec3 && rec3.standings[0].acct === accts[2] && rec3.standings.at(-1).acct === accts[0], 'leaver ranked last, survivors scored normally');
  ok(R.payoutStatus('MT3').payouts.length === 3, 'payouts queued');

  console.log('Light Cycles teams: all disconnect after round 1 of bo3');
  ({ r, ps, accts } = setup('MT4', 4, { teams: 2, bo3: true }));
  const winT = ps[0].team; r.onRound({ teams: [winT], alive: [] });
  ps.forEach(p => { r.t += 1; leave(r, p); }); tick(r);
  const rec4 = JSON.parse(fs.readFileSync(path.join(DIR, 'ranked_matches.json')))['MT4'], potT = 4 * (BUY - BURN), each = Math.floor((potT - 200) / 2);
  const winners = rec4.standings.filter(s => s.prizeDrops > 0);
  ok(winners.length === 2 && winners.every(s => s.team === winT && s.prizeDrops === each), `team that won round 1 splits equally (${each / 1e6} XRP each)`);
  ok(R.payoutStatus('MT4').status === 'queued' && !Srv.rooms.tron.includes(r), 'queued automatically, room removed');

  console.log('Light Cycles teams: one whole team disconnects -> remaining team wins the round');
  ({ r, ps, accts } = setup('MT5', 4, { teams: 2 }));
  const t1 = ps.filter(p => p.team === 1); r.t += 60; t1.forEach(p => { r.t += 1; leave(r, p); });
  for (let i = 0; i < 5 && r.tl.state === 'live'; i++) r.step(1 / 30);
  const rec5 = JSON.parse(fs.readFileSync(path.join(DIR, 'ranked_matches.json')))['MT5'];
  ok(rec5 && rec5.standings.filter(s => s.prizeDrops > 0).every(s => s.team === 2), 'team 2 paid, leavers get nothing');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
