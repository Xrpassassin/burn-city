// Zombie server rules: window throttle, i-frames, wave scaling, runner speed, Firestorm ray + hit markers, ranked lock / reconnect / late-pay refund.
const fs = require('fs'), path = require('path'), os = require('os');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bczom-')); Object.assign(process.env, { DATA_DIR: DIR, TOKEN_SECRET: 'x', DRY_RUN: 'true', TREASURY_ADDRESS: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp', BURN_JOB_IN_SERVER: 'false' });
const Z = require('../server/cod'), { Room } = require('../server/game'), Ranked = require('../server/ranked');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const mk = n => { const r = new Room(1, 'zombie'); for (let i = 0; i < n; i++) r.add({ name: 'p' + i, ws: { send() {}, readyState: 1 } }); return r; };
{ const room = { zombies: new Map() }; Z.resetMap(room); room.boards[0] = 0; const w = Z.WINDOWS[0];
  for (let i = 0; i < 8; i++) room.zombies.set(i, { id: i, x: w.ox, z: w.oz, sp: 3, win: 0, ph: 0 });
  let maxC = 0, ent = []; for (let t = 0; t < 20; t += .05) { room.zt = t; for (const zb of room.zombies.values()) { const was = zb.ph; Z.atWindow(room, zb, .05, []); if (was === 0 && zb.ph === 1) ent.push(t); } maxC = Math.max(maxC, [...room.zombies.values()].filter(z => z.win === 0 && z.ph === 1).length); }
  const gaps = ent.slice(1).map((e, i) => e - ent[i]); ok(ent.length === 8 && maxC <= 2 && Math.min(...gaps) >= 1.29, `window throttle: ${ent.length} entered, max ${maxC} climbing, min gap ${Math.min(...gaps).toFixed(2)}s`); }
ok(Z.scaleN(1) < Z.scaleN(2) && Z.scaleN(2) < Z.scaleN(4), 'zombie count scales with players (solo gentler)');
ok(Z.hpN(1) < 1 && Z.hpN(4) > Z.hpN(2), 'zombie HP scales with players');
ok(Z.waveGap(1) >= 8 && Z.waveGap(1) <= 12 && Z.waveGap(6) >= 8, `wave gaps 8-12 s (solo ${Z.waveGap(1)}s, 6p ${Z.waveGap(6)}s)`);
ok(Math.abs(1 - Z.RUNNER / 1.7 - 0.176) < 0.02, `runners ${((1 - Z.RUNNER / 1.7) * 100).toFixed(0)}% slower`);
{ const r = mk(1); r.events = []; for (let i = 0; i < 400 && r.wave < 1; i++) r.step(0.05); ok(r.wave === 1 && r.spawned + r.toSpawn === Math.round(10 * Z.scaleN(1)), 'solo wave 1 size scaled: ' + (r.spawned + r.toSpawn));
  const r2 = mk(4); for (let i = 0; i < 400 && r2.wave < 1; i++) r2.step(0.05); ok(r2.spawned + r2.toSpawn > r.spawned + r.toSpawn, '4p wave bigger: ' + (r2.spawned + r2.toSpawn)); }
{ const r = mk(1), p = [...r.players.values()][0]; r.wave = 1; r.toSpawn = 0; r.waveDelay = 99; r.zombies.clear(); p.inv = 0; const hp0 = p.hp;
  r.zombies.set(500, { id: 500, ty: 0, x: p.x + .5, z: p.z, hp: 1e6, sp: 0, win: null, ph: 0 }); for (let i = 0; i < 10; i++) r.step(0.05);
  const hits = r.events.filter(e => e.e === 'phit').length; ok(hits === 1 && p.hp === hp0 - 12, `i-frames: 1 hit in 0.5 s (hp ${hp0}->${p.hp})`); }
// Random spawn can sit next to a wall that (correctly) stops the ray; retry spawns until the 2 m line of fire is clear.
{ let r, p, shot, hm; for (let tries = 0; tries < 12; tries++) { r = mk(1); p = [...r.players.values()][0]; r.wave = 1; r.toSpawn = 0; r.waveDelay = 99; r.zombies.clear(); p.guns = ['napalm']; p.slot = 0; p.fuel = 100; p.cd = 0; p.yaw = 0; p.inv = 99;
  var s = Math.sin(p.yaw), c = Math.cos(p.yaw); r.zombies.set(600, { id: 600, ty: 0, x: p.x + s * 2, z: p.z + c * 2, hp: 50, sp: 0, win: null, ph: 0 }); r.zombies.set(601, { id: 601, ty: 0, x: p.x + s * 2 + .8 * c, z: p.z + c * 2 - .8 * s, hp: 500, sp: 0, win: null, ph: 0 });
  p.in = { mx: 0, mz: 0, fire: true, turn: 0 }; r.events = []; r.step(0.05);
  shot = r.events.find(e => e.e === 'shot'); hm = r.events.find(e => e.e === 'hm'); if (shot && Math.hypot(shot.tx - shot.x, shot.tz - shot.z) > 1.9) break; }
  ok(Z.WEAPONS.find(w => w.id === 'napalm').name === 'Firestorm' && shot && shot.ray, 'Firestorm (id napalm, owners migrate) fires a ray');
  ok(hm && hm.k === 1 && hm.id === p.id, 'server hit marker, kill flag on kill');
  ok(!r.zombies.has(600) || r.zombies.get(600).hp <= 0, 'ray hit first zombie'); ok(r.zombies.get(601)?.hp < 500, 'small splash hit neighbour'); }
// 3D aim: pitch is clamped server-side; aiming straight at the floor misses a zombie 2 m ahead, level aim still hits it.
{ const r0 = mk(1), p0 = [...r0.players.values()][0]; r0.input(p0, { mx: 0, mz: 0, yaw: 0, pi: 9 }); ok(Math.abs((p0.pitch ?? 0) - 1.4) < 1e-9, 'aim pitch clamped to 1.4 rad (got ' + p0.pitch + ')');
  const shoot = pi => { let r, p, z; for (let tries = 0; tries < 12; tries++) { r = mk(1); p = [...r.players.values()][0]; r.wave = 1; r.toSpawn = 0; r.waveDelay = 99; r.zombies.clear(); p.guns = ['napalm']; p.slot = 0; p.fuel = 100; p.cd = 0; p.pitch = pi;
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw); if (!Z.los(r, p.x, p.z, p.x + s * 2.5, p.z + c * 2.5, p.y)) continue; z = { id: 900, ty: 0, x: p.x + s * 2, z: p.z + c * 2, hp: 1e6, maxhp: 1e6, sp: 0, win: null, ph: 0 }; r.zombies.set(900, z);
      p.in = { mx: 0, mz: 0, fire: true, turn: 0 }; r.events = []; r.step(0.05); return { hit: z.hp < 1e6, shot: r.events.find(e => e.e === 'shot') }; } return null; };
  const lv = shoot(0), dn = shoot(-1.4); ok(lv && lv.hit, 'level aim hits zombie 2 m ahead'); ok(dn && !dn.hit && dn.shot && dn.shot.ty < -1, 'aiming at the floor misses it, tracer ends low (ty ' + dn?.shot?.ty + ')'); }
{ const r = mk(1); for (let i = 0; i < 20; i++) r.zombies.set(700 + i, { id: 700 + i, ty: 0, x: 0, z: 0, hp: 1, sp: 0, win: null, ph: 0 });
  const p = { name: 'late', ws: { send() {}, readyState: 1 } }; r.add(p); ok(p.alive && p.inv >= 2, 'drop-in mid match: spawned with grace'); }
{ Ranked.lobbies.MX = { id: 'MX', game: 'zombie', state: 'started', paid: ['rA'], buyin: 1e6 }; Ranked.tickets.T1 = { account: 'rA', match: 'MX', used: Date.now(), drops: 1e6, exp: Date.now() + 1e6 }; Ranked.tickets.T2 = { account: 'rB', match: 'MX', used: false, drops: 1e6, exp: Date.now() + 1e6, hash: 'H' };
  ok(Ranked.reconOk('T1', 'rA', Ranked.lobbies.MX), 'ranked: admitted entrant may reconnect');
  ok(!Ranked.reconOk('T2', 'rB', Ranked.lobbies.MX) && !Ranked.ticketOk('T2', 'rB'), 'ranked: late payer locked out of started match');
  ok(!Ranked.reconOk('T1', 'rZ', Ranked.lobbies.MX), 'ranked: other wallet with entrant ticket rejected');
  ok(Ranked.refunds().some(x => x.ticket === 'T2') && !Ranked.refunds().some(x => x.ticket === 'T1'), 'ranked: late payment goes to refund flow'); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
