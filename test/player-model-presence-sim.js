// Player model over presence: the city WS `p` message carries pm ('g' Gas Mask Guy, else the default Hover Mage)
// and every other client sees it in the 3 Hz snapshot (index 14); arena/Zombies joins carry &pm=g into look.pm.
// Piggybacks the existing messages (no new requests). Local only, no real keys.
const fs = require('fs'), path = require('path'), os = require('os'), xrpl = require('xrpl');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bcpm-'));
Object.assign(process.env, { DATA_DIR: DIR, PORT: '0', TOKEN_SECRET: 'pmsecret', XRPL_WSS: 'ws://127.0.0.1:1', TREASURY_ADDRESS: xrpl.Wallet.generate().classicAddress, DRY_RUN: 'true', BURN_JOB_IN_SERVER: 'false' });
const Srv = require('../server/server'), WS = require('ws');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000, every = 20) => { const end = Date.now() + ms; for (;;) { const v = fn(); if (v || Date.now() >= end) return v || undefined; await wait(every); } };
const open = (url, ip) => { const w = new WS(url, { headers: { 'fly-client-ip': ip } }); w.msgs = []; w.on('message', d => { try { w.msgs.push(JSON.parse(d)); } catch (e) { } }); return w; };
(async () => {
  const port = await new Promise(r => Srv.server.listening ? r(Srv.server.address().port) : Srv.server.on('listening', () => r(Srv.server.address().port)));
  console.log('City presence carries each player model');
  const conns = ['10.9.0.1', '10.9.0.2', '10.9.0.3', '10.9.0.4'].map(ip => open('ws://127.0.0.1:' + port + '/?mode=city', ip));
  await until(() => conns.every(w => w.msgs.some(m => m.t === 'w')));
  const ids = conns.map(w => w.msgs.find(m => m.t === 'w')?.id);
  ok(ids.every(Boolean), 'four guests joined the city channel');
  const sendP = (w, pm) => w.send(JSON.stringify({ t: 'p', x: 1, y: 0, z: 2, r: 0, md: 'w', ...(pm === undefined ? {} : { pm }) }));
  sendP(conns[0], 'g'); sendP(conns[1], 'm'); sendP(conns[2]); sendP(conns[3], { evil: 1 });
  const snapOf = w => [...w.msgs].reverse().find(m => m.t === 's' && m.p.length === 4);
  let snap = await until(() => snapOf(conns[3]));
  const pm = (s, id) => s && (s.p.find(p => p[0] === id) || [])[14];
  ok(snap && pm(snap, ids[0]) === 'g', 'A chose Gas Mask Guy -> others see g');
  ok(pm(snap, ids[1]) === 'm', 'B chose the Hover Mage -> m');
  ok(pm(snap, ids[2]) === 'm', 'C sent no pm (old client) -> default m');
  ok(pm(snap, ids[3]) === 'm', 'D sent junk -> default m');
  ok(snap.p.every(p => p.length === 15 && p[13] === 'skiff'), 'snapshot rows keep the boat class at 13 (pm appended at 14)');
  // switching in Settings mid-session rides the next position update
  conns[0].msgs.length = 0; sendP(conns[0], 'm');
  snap = await until(() => { const s = snapOf(conns[0]); return s && pm(s, ids[0]) === 'm' ? s : null; });
  ok(!!snap, 'A switches to the mage -> the next snapshot says m');
  conns.forEach(w => w.close());

  console.log('Arena/Zombies join carries look.pm');
  const z1 = open('ws://127.0.0.1:' + port + '/?mode=zombie&name=pmA&look=&pm=g', '10.9.1.1');
  await until(() => z1.msgs.some(m => m.t === 'init'));
  const z2 = open('ws://127.0.0.1:' + port + '/?mode=zombie&name=pmB&look=', '10.9.1.2');
  const init2 = await until(() => z2.msgs.find(m => m.t === 'init'));
  const init1 = z1.msgs.find(m => m.t === 'init');
  const look = (init, id) => ((init?.roster || []).find(r => r[0] === id) || [])[2] || null;
  if (init2 && init1 && init2.world !== undefined && (init2.roster || []).some(r => r[0] === init1.me)) {
    ok(look(init2, init1.me)?.pm === 'g', 'second zombie player sees the first one\'s look.pm = g');
    ok(!('pm' in (look(init2, init2.me) || {})), 'no pm param -> no look.pm (client shows the default mage)');
  } else ok(false, 'zombie clients shared a room: ' + JSON.stringify({ a: init1?.me, b: init2?.me, roster: init2?.roster }));
  z1.close(); z2.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
