// Chat scam filter, mutes, rate limits, CORS/headers, WS caps, history endpoint, treasury watchdog. Local only, no real keys.
const fs = require('fs'), path = require('path'), os = require('os'), xrpl = require('xrpl');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bcsec-')), T = xrpl.Wallet.generate().classicAddress;
Object.assign(process.env, { DATA_DIR: DIR, PORT: '0', TOKEN_SECRET: 'simsecret', XRPL_WSS: 'ws://127.0.0.1:1', TREASURY_ADDRESS: T, DRY_RUN: 'true', BURN_JOB_IN_SERVER: 'false' });
const Scam = require('../server/scam'), Srv = require('../server/server'), Pay = require('../server/payments'), WS = require('ws');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Chat filter');
  const blk = ['FREE XRP giveaway', 'airdrop live now', 'claim your BURN here', 'support will dm you', 'DM me for help', 'verify your wallet', 'share your secret key', 'join t.me/burnclaim', 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2', 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb',
    'abandon ability able about above absent absorb abstract absurd abuse access accident', 'send 10 XRP get 20 back'];
  for (const t of blk) ok(Scam.scrub(t).blocked, 'blocked: ' + t.slice(0, 40));
  const rm = [['go to evil.com now', 'evil.com'], ['xrp[.]claim', 'xrp[.]claim'], ['hxxps://bad.site/x', 'bad.site'], ['xrpburn dot io/free', 'dot io'], ['ｅｖｉｌ．ｃｏｍ', 'ｅｖｉｌ'], ['bit.lу/abc', 'bit.l'], ['visit еvil.com', 'vil.com'],
    ['pay rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh', 'rHb9'], ['ftp://x.y.ru', 'x.y.ru'], ['WWW.SCAM.NET', 'SCAM']];
  for (const [t, bad] of rm) { const r = Scam.scrub(t); ok(!r.blocked && !r.text.toLowerCase().includes(bad.toLowerCase()) && /removed/.test(r.text) || r.blocked, 'removed: ' + t + ' -> ' + (r.blocked ? '[blocked]' : r.text)); }
  for (const t of ['gm burners', 'trade on xrpburn.com', 'https://xrpassassin.github.io/burn-city/', 'that was 3.22% lol', 'e.g. nice', 'see you at 5.30', 'Burn City is fun... really'])
    ok(Scam.scrub(t).text === t && !Scam.scrub(t).reasons.length, 'kept: ' + t);
  Scam.strike('w1'); Scam.strike('w1'); ok(!Scam.muted('w1'), '2 strikes: not muted'); Scam.strike('w1'); ok(Scam.muted('w1'), '3 strikes in 30 min: auto-muted');

  const port = await new Promise(r => Srv.server.listening ? r(Srv.server.address().port) : Srv.server.on('listening', () => r(Srv.server.address().port)));
  const H = 'http://127.0.0.1:' + port;
  console.log('HTTP hardening');
  let r = await fetch(H + '/api/status', { headers: { origin: 'https://evil.example' } });
  ok(r.headers.get('access-control-allow-origin') === 'https://xrpassassin.github.io', 'CORS: foreign origin not echoed');
  r = await fetch(H + '/api/status', { headers: { origin: 'https://xrpassassin.github.io' } }); ok(r.headers.get('access-control-allow-origin') === 'https://xrpassassin.github.io', 'CORS: site origin allowed');
  r = await fetch(H + '/api/status', { headers: { origin: 'http://localhost:5173' } }); ok(r.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'CORS: localhost allowed');
  ok(r.headers.get('strict-transport-security') && r.headers.get('x-frame-options') === 'DENY' && r.headers.get('x-content-type-options') === 'nosniff', 'HSTS, frame-deny, nosniff present');
  const A = xrpl.Wallet.generate().classicAddress;
  r = await (await fetch(H + '/api/history?acct=' + A)).json(); ok(Array.isArray(r.items) && r.totals && r.mine === false, 'history: public read-only view works');
  r = await (await fetch(H + '/api/history?acct=notanaddress')).json(); ok(r.error === 'bad_address', 'history: invalid address rejected');
  let codes = []; for (let i = 0; i < 22; i++) codes.push((await fetch(H + '/api/history?acct=' + A)).status); ok(codes.includes(429), 'history: rate-limited (20/min)');
  r = await fetch(H + '/admin/ranked/matches', { headers: { 'x-admin-token': 'wrong' } }); ok(r.status === 403, 'admin: wrong token -> 403');

  console.log('WebSocket hardening');
  const open = (q, o = {}) => new Promise(res => { const w = new WS('ws://127.0.0.1:' + port + '/?' + q, o), msgs = []; let code = null; w.on('message', d => msgs.push(JSON.parse(d))); w.on('close', c => code = c); w.on('error', () => {}); setTimeout(() => res({ w, msgs, code: () => code }), 400); });
  const evil = await open('mode=tron', { headers: { origin: 'https://evil.example' } }); ok(evil.code() === 1008, 'WS: foreign origin rejected');
  const many = []; for (let i = 0; i < 14; i++) many.push(await open('mode=tron')); ok(many.filter(x => x.code() === 1008).length >= 1, 'WS: per-IP connection cap enforced');
  many.forEach(x => x.w.close()); await wait(300);
  const big = await open('mode=tron'); big.w.send('x'.repeat(2000)); await wait(300); ok(big.code() !== null, 'WS: oversized message closes the socket');
  const g = await open('mode=tron'); g.w.send(JSON.stringify({ t: 'i', turn: 999 })); g.w.send(JSON.stringify({ t: 'evil' })); g.w.send('[1,2]'); await wait(200); ok(g.code() === null, 'WS: junk/impossible game messages ignored safely');
  g.w.close(); big.w.close?.();
  console.log('City chat over WS (signed-in)');
  const B = xrpl.Wallet.generate().classicAddress, tok = Pay.sign({ acct: B, exp: Date.now() + 1e6 });
  const c = await open('mode=city&token=' + encodeURIComponent(tok)); const say = async t => { c.msgs.length = 0; c.w.send(JSON.stringify({ t: 'c', b: t })); await wait(150); return c.msgs.find(m => m.t === 'c' || m.t === 'e'); };
  let m = await say('hello <script>alert(1)</script>'); ok(m.t === 'c' && !m.b.includes('<script>'), 'HTML is neutralised: ' + m.b);
  m = await say('check evil.com'); ok(m.t === 'c' && m.b === 'check [link removed]', 'link removed in live chat');
  m = await say('free xrp airdrop'); ok(m.t === 'e' && m.e === 'blocked_scam', 'scam pitch blocked in live chat');
  m = await say('go bad.net'); m = await say('normal msg'); ok(m.t === 'e' && m.e === 'muted', 'repeat offender auto-muted');
  c.w.close();

  console.log('Treasury watchdog');
  const W = require('../server/watch'), Q = require('../server/payq'), G = require('../server/guard');
  const t0 = Math.floor(Date.now() / 1000) - 946684800 - 600; let txs = [{ validated: true, hash: 'OLD1', tx_json: { Account: T, TransactionType: 'Payment', date: t0 } }];
  const led = async () => ({ request: async () => ({ result: { transactions: txs } }) });
  await W.tick(led); ok(!G.paused(), 'baseline: old history does not pause');
  Q.enqueue([{ id: 'Mw:prize:1', kind: 'prize', match: 'Mw', dest: A, drops: 1e6 }]); Q.db.prepare("UPDATE payq SET hash='QHASH', status='paid' WHERE id='Mw:prize:1'").run();
  txs = [{ validated: true, hash: 'QHASH', tx_json: { Account: T, TransactionType: 'Payment', date: t0 + 300 } }, ...txs]; await W.tick(led); ok(!G.paused(), 'queue-created payout: no alert');
  txs = [{ validated: true, hash: 'FRESH', tx_json: { Account: T, TransactionType: 'Payment', date: Math.floor(Date.now() / 1000) - 946684800 } }, ...txs]; await W.tick(led); ok(!G.paused(), 'very fresh tx gets a grace period');
  txs = [{ validated: true, hash: 'THIEF', tx_json: { Account: T, TransactionType: 'Payment', Destination: A, Amount: '9000000', date: t0 + 400 } }, ...txs]; await W.tick(led); ok(G.paused(), 'unknown outgoing tx -> payouts auto-paused');
  W.unpause(); ok(!G.paused(), 'admin unpause clears it (and whitelists that tx)');
  txs.find(x => x.hash === 'FRESH').tx_json.date -= 600; await W.tick(led); ok(G.paused(), '...but the still-unknown FRESH tx pauses again after its grace period');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
