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
// Gantry atrium: shoot down from the catwalk and up from the floor through the open centre (pitched aim required, level aim misses).
{ process.env.ZOMBIE_CLASSIC = '1'; const cx = c => (c - Z.GW / 2 + 0.5) * Z.CELL, cz = r => (r - Z.GH / 2 + 0.5) * Z.CELL, UH = 3.6;
  const fire = (px, pz, plv, yaw, pi, zx, zz, zlv) => { const r = mk(1), p = [...r.players.values()][0]; r.wave = 1; r.toSpawn = 0; r.waveDelay = 99; r.zombies.clear(); r.open = 0xff;
    Object.assign(p, { x: px, z: pz, lv: plv, y: plv * UH, yaw, pitch: pi, guns: ['napalm'], slot: 0, fuel: 100, cd: 0, inv: 0 }); const z = { id: 950, ty: 0, x: zx, z: zz, lv: zlv, y: zlv * UH, hp: 1e6, maxhp: 1e6, sp: 0, win: null, ph: 0 }; r.zombies.set(950, z);
    p.in = { mx: 0, mz: 0, fire: true, turn: 0 }; r.events = []; r.step(0.05); return z.hp < 1e6; };
  const cat = [cx(26), cz(25)], flo = [cx(31), cz(25)], d = flo[0] - cat[0];
  ok(fire(cat[0], cat[1], 1, Math.PI / 2, -Math.atan((UH + 1.6 - 1) / d), flo[0], flo[1], 0), 'Gantry: pitched-down shot from the catwalk hits a zombie on the atrium floor');
  ok(!fire(cat[0], cat[1], 1, Math.PI / 2, 0, flo[0], flo[1], 0), 'Gantry: level shot from the catwalk passes over it');
  ok(fire(flo[0], flo[1], 0, -Math.PI / 2, Math.atan((UH + 1 - 1.6) / d), cat[0], cat[1], 1), 'Gantry: pitched-up shot from the floor hits a zombie on the catwalk');
  ok(!fire(flo[0], flo[1], 0, -Math.PI / 2, 0, cat[0], cat[1], 1), 'Gantry: level shot from the floor misses the catwalk'); delete process.env.ZOMBIE_CLASSIC; }
{ process.env.ZOMBIE_CLASSIC = '1'; const Heli = require('../server/heli');
  const H = n => { const r = mk(n); r.open = 0x1ff; r.wave = 3; r.toSpawn = 0; r.waveDelay = 1e9; r.zombies.clear(); const ps = [...r.players.values()]; for (const p of ps) { p.in = { mx: 0, mz: 0, fire: false, turn: 0 }; p.inv = 0; } return [r, ps]; };
  const run = (r, s, dt = 0.05) => { const out = []; for (let t = 0; t < s; t += dt) { r.events = []; r.step(dt); out.push(...r.events); } return out; };
  const onPad = (r, p) => Object.assign(p, { x: r.heli.x, z: r.heli.z, lv: 1, y: Z.UH });
  const live = n => { const [rr, ps] = H(n); Z.bind(rr); Heli.start(rr, []); rr.toSpawn = 0; rr.heli.st = 2; rr.heli.t = 60; return [rr, ps]; };
  { const [r, [p]] = H(1); const q = r.quest; ok(q && q.bea, 'heli: classic quest has the ch.4 pad beacon');
    q.st = 6; q.brk = -1; r.wave = 3; r.events = []; r.step(0.05); ok(q.st === 7 && q.it && q.it.kind === 4, 'heli: after the flare stack, the next break calls ch.4 (beacon battery)');
    q.st = 9; q.it = { kind: 5, x: q.bea.x, z: q.bea.z, lv: 1, by: p.id }; Object.assign(p, { x: q.bea.x, z: q.bea.z, lv: 1, y: Z.UH }); p.in.use = true; r.events = []; r.step(0.05);
    ok(q.st === 10 && r.heli && r.heli.st === 1 && r.toSpawn > 0, 'heli: lighting the flare at the beacon calls the helicopter (+ surge)');
    // The inbound surge is real (random spawns) and can down an idle solo player in 20 s, which ends the match and stops the heli clock
    // (~17% of runs before this). This check is about the landing timer, so the player can't be hit while the bird is inbound.
    p.inv = 1e9; const ev = run(r, 20.2); ok(r.heli.st === 2 && ev.some(e => e.e === 'heli' && e.s === 2) && !r.over, 'heli: lands and opens boarding after ~20 s'); }
  { const [r] = H(1); r.ranked = { state: 'live', results: new Map() }; Heli.start(r, []); ok(!r.heli, 'heli: never in ranked'); }
  { const [r, [p, o]] = live(2); onPad(r, p); Object.assign(o, { x: r.heli.x + 12, z: r.heli.z, lv: 1, y: Z.UH }); run(r, 0.1);
    ok(p.aboard && r.heli.b.has(p.id) && !o.aboard, 'heli: standing on the pad boards you'); const hp = p.hp;
    r.zombies.set(900, { id: 900, ty: 0, x: p.x + 0.5, z: p.z, lv: 1, y: Z.UH, hp: 1e6, maxhp: 1e6, sp: 3, win: null, ph: 1 }); o.inv = 99; run(r, 2);
    ok(p.hp === hp && p.alive, 'heli: boarded players are protected'); }
  { const [r, [a, b, c]] = live(3); onPad(r, a); run(r, 0.1); a.in.vote = true; run(r, 0.1); ok(r.heli.st === 2, 'heli: 1 vote of 3 active does not depart');
    const [r2, [a2, b2, c2]] = live(3); b2.away = true; c2.spectator = true; Object.assign(b2, { x: 0, z: 0 }); Object.assign(c2, { x: 0, z: 0 }); onPad(r2, a2); run(r2, 0.1);
    ok(r2.heli.st === 2 && r2.heli.dep > 0, 'heli: away + spectating players are not counted (sole active player aboard -> departing countdown)');
    run(r2, Heli.DEPART + 0.2); ok(r2.heli.st === 3 && r2.heli.why === 'all', 'heli: departing countdown ends -> liftoff');
    const [r3, [d, e, f]] = live(3); Object.assign(f, { away: true }); onPad(r3, d); Object.assign(e, { x: 0, z: 0, lv: 0, y: 0 }); run(r3, 0.1); ok(r3.heli.st === 2, 'heli: 1 of 2 active aboard, no vote yet: still boarding');
    d.in.vote = true; run(r3, 0.1); ok(r3.heli.st === 2, 'heli: 1 vote of 2 active is not a majority'); }
  { const [r, [p, o]] = live(2); Object.assign(o, { x: 0, z: 0, lv: 0, y: 0 }); onPad(r, p); run(r, 0.1); p.in.vote = true; o.in.vote = true; run(r, 0.1);
    ok(r.heli.st === 2 && !o.aboard, 'heli: votes from players not aboard do nothing'); r.heli.t = 0.01; run(r, 0.1); ok(r.heli.st === 3 && r.heli.why === 'time', 'heli: timer runs out -> departs'); }
  { const [r, [p, o]] = live(2); Object.assign(o, { x: 0, z: 0, lv: 0, y: 0, inv: 99, hp: 1e9 }); const z = { id: 901, ty: 0, x: 0, z: 0, lv: 1, y: Z.UH, hp: 1e6, maxhp: 1e6, sp: 0, win: null, ph: 1 }; onPad(r, p); run(r, 0.1);   // o stays off the pad so it doesn't auto-depart
    p.in.use = true; run(r, 0.05); ok(p.mg === 0 && r.heli.g[0] === p.id, 'heli: USE while aboard mans a minigun');
    const [sx, sz] = [p.x, p.z]; z.x = sx; z.z = sz - 8; for (const k of ["x", "z"]) { const v = z[k]; Object.defineProperty(z, k, { get: () => v, set() {} }); } r.zombies.set(901, z); p.yaw = Math.PI; p.pitch = -Math.atan((p.y + 1.6 - (Z.UH + 1)) / 8);
    p.in.fire = false; run(r, 0.5); ok(z.hp === 1e6, 'heli: no fire, no minigun damage');
    p.in.fire = true; const ev = run(r, 1.5); ok(z.hp < 1e6 - 30 * 10 && ev.some(e => e.e === 'shot' && e.w === 'minigun'), `heli: minigun hits resolved server-side (${Math.round(1e6 - z.hp)} dmg, tracers sent)`);
    const z2 = { ...z, id: 902, hp: 1e6, x: sx + 10, z: sz }; r.zombies.set(902, z2); run(r, 1); ok(z2.hp === 1e6, 'heli: minigun only hits along the aim'); }
  { const [r, [p, o]] = live(2); onPad(r, p); Object.assign(o, { x: 0, z: 0, lv: 0, y: 0, inv: 0 }); run(r, 0.1); r.heli.t = 0.01; process.env.ZOMBIE_TEST_GOD = '';
    o.hp = 1e9; const ev = run(r, 18); const rx = ev.find(e => e.e === 'hres' && e.id === p.id), rl = ev.find(e => e.e === 'hres' && e.id === o.id);
    ok(rx && rx.r === 'x' && rl && rl.r === 'l' && ev.some(e => e.e === 'hleft' && e.id === o.id) && ev.some(e => e.e === 'gameover' && e.heli === 1) && r.over > 0, 'heli: extracted vs left-behind results, brutal surge, then match end');
    ok((r.heli.swarmN || 0) >= 14, `heli: fast aggressive variants spawned (${r.heli.swarmN})`); }
  { const [r, [p]] = live(1); onPad(r, p); run(r, 0.1); ok(p.aboard && r.heli.st === 2 && r.heli.dep > 8, 'heli solo: all aboard starts an 8-10 s departing countdown, not an instant leave');
    p.in.use = true; run(r, 0.1); run(r, 4); ok(r.heli.st === 2 && p.mg === 0, 'heli solo: still boarding 4 s later and the minigun can be manned');
    p.in.vote = true; run(r, 0.1); ok(r.heli.st === 3 && r.heli.why === 'vote', 'heli solo: a vote skips the countdown'); }
  delete process.env.ZOMBIE_CLASSIC; }
{ const Quest = require('../server/quest'), Heli = require('../server/heli'); let padOk = 0, qOk = 0, bad = [];
  for (let k = 0; k < 50; k++) { const seed = 1000 + k * 7777, r = mk(1); r.seedT = seed; r.reset(); Z.bind(r); const M = r.M, Q = M.QDEF, p = [...r.players.values()][0];
    if (M.kind !== 'proc' || !M.UPG || !Q || !Q.pad || !Q.beacon) { bad.push(seed + ':nopad'); continue; }
    // two-floor BFS from spawn with every door open; ramps join the floors
    const key = (lv, c, rr) => lv * 10000 + rr * Z.GW + c, pass = (lv, c, rr) => { const v = (lv ? M.UPG : M.GRID)[rr]?.[c]; return v !== undefined && v >= 0; }, seen = new Set(), q = [];
    for (let rr = 0; rr < Z.GH && !q.length; rr++) for (let c = 0; c < Z.GW; c++) if (M.GRID[rr][c] === 0) { q.push([0, c, rr]); seen.add(key(0, c, rr)); break; }
    for (let i = 0; i < q.length; i++) { const [lv, c, rr] = q[i]; const nx = [[lv, c + 1, rr], [lv, c - 1, rr], [lv, c, rr + 1], [lv, c, rr - 1]]; if (M.RAMPAT[rr * Z.GW + c] !== undefined) nx.push([1 - lv, c, rr]);
      for (const n of nx) { const kk = key(...n); if (!seen.has(kk) && pass(...n)) { seen.add(kk); q.push(n); } } }
    const cellOf = (x, z) => [Math.floor(x / Z.CELL + Z.GW / 2), Math.floor(z / Z.CELL + Z.GH / 2)], [bc, br] = [Q.beacon[0], Q.beacon[1]], [pc, pr] = cellOf(Z.WX(Q.pad[0]), Z.WZ(Q.pad[1]));
    const padCells = M.UPG.flat().filter(v => v === Q.padZone).length, vents = M.WINDOWS.filter(w => w.lv && w.zone === Q.padZone).length, door = M.DOORS.some(d => d.b === Q.padZone && d.cost > 0);
    if (seen.has(key(1, bc, br)) && seen.has(key(1, pc, pr)) && padCells >= 30 && vents >= 2 && door && M.UPG[pr][pc] === Q.padZone) padOk++; else bad.push(seed + ':reach');
    // play the short Night Shift through to the helicopter (teleporting between steps; reachability is covered above)
    r.open = (1 << 12) - 1; r.wave = 3; r.toSpawn = 0; r.waveDelay = 1e9; r.zombies.clear(); p.in = { mx: 0, mz: 0 }; const qs = r.quest; let guard = 0;
    while (qs && qs.st < 10 && guard++ < 12) { const ev = []; if (!qs.it) { qs.brk = -1; Quest.onBreak(r, ev); if (!qs.it) break; }
      const it = qs.it; Object.assign(p, { x: it.x, z: it.z, lv: it.lv, y: it.lv * Z.UH, alive: true, down: 0 }); Quest.tick(r, [p], ev); r.zombies.clear();
      const t = qs.st >= 6 ? qs.bea : qs.con; Object.assign(p, { x: t.x, z: t.z, lv: t.lv, y: t.lv * Z.UH }); Quest.use(r, p, ev); }
    if (qs && qs.st === 10 && r.heli && r.heli.st === 1) qOk++; else bad.push(seed + ':quest' + (qs && qs.st)); }
  ok(padOk === 50, `generated maps: 50/50 seeds have a reachable rooftop pad behind a door with vents (${padOk}) ${bad.slice(0, 4).join(' ')}`);
  ok(qOk === 50, `generated maps: 50/50 seeds play the short Night Shift through to the helicopter (${qOk})`); }
{ const r = mk(1); for (let i = 0; i < 20; i++) r.zombies.set(700 + i, { id: 700 + i, ty: 0, x: 0, z: 0, hp: 1, sp: 0, win: null, ph: 0 });
  const p = { name: 'late', ws: { send() {}, readyState: 1 } }; r.add(p); ok(p.alive && p.inv >= 2, 'drop-in mid match: spawned with grace'); }
{ Ranked.lobbies.MX = { id: 'MX', game: 'zombie', state: 'started', paid: ['rA'], buyin: 1e6 }; Ranked.tickets.T1 = { account: 'rA', match: 'MX', used: Date.now(), drops: 1e6, exp: Date.now() + 1e6 }; Ranked.tickets.T2 = { account: 'rB', match: 'MX', used: false, drops: 1e6, exp: Date.now() + 1e6, hash: 'H' };
  ok(Ranked.reconOk('T1', 'rA', Ranked.lobbies.MX), 'ranked: admitted entrant may reconnect');
  ok(!Ranked.reconOk('T2', 'rB', Ranked.lobbies.MX) && !Ranked.ticketOk('T2', 'rB'), 'ranked: late payer locked out of started match');
  ok(!Ranked.reconOk('T1', 'rZ', Ranked.lobbies.MX), 'ranked: other wallet with entrant ticket rejected');
  ok(Ranked.refunds().some(x => x.ticket === 'T2') && !Ranked.refunds().some(x => x.ticket === 'T1'), 'ranked: late payment goes to refund flow'); }
// Auto-fire reach = effective weapon range (snapshot field 21): grows with Long Reach / Forge, follows weapon swaps, shrinks back when the buff is gone.
{ const { fireRange } = require('../server/game'), r = mk(1), p = [...r.players.values()][0], ar = () => r.snapshot().p.find(x => x[0] === p.id)[21];
  const near = (a, b) => Math.abs(a - b) < 0.051;
  Object.assign(p, { guns: ['flamer', 'napalm'], slot: 0, up: [], bon: {}, down: 0 }); const base = fireRange(p);
  ok(base === 9 && near(ar(), 9), `auto range = flamer base 9 m (snapshot ${ar()})`);
  p.bon.range = 1; ok(near(fireRange(p) / base, 1.08) && near(ar(), 9 * 1.08), `Long Reach I: auto range x1.08 -> ${ar()} m`);
  p.bon.range = 3; ok(near(fireRange(p) / base, 1.24) && near(ar(), 9 * 1.24), `Long Reach III: auto range x1.24 -> ${ar()} m`);
  p.up = ['flamer']; ok(near(fireRange(p), 9 * 1.15 * 1.24), `Forged + Long Reach III stack: ${fireRange(p).toFixed(2)} m`);
  p.slot = 1; ok(near(fireRange(p), 26 * 1.24) && near(ar(), 26 * 1.24), `swap to Firestorm: auto range follows the gun -> ${ar()} m`);
  p.slot = 0; p.up = []; p.bon = {}; ok(fireRange(p) === base && near(ar(), base), `buff gone: auto range shrinks back to ${ar()} m`);
  p.down = 1; ok(fireRange(p) === 17, 'downed: last-stand pistol 17 m'); p.up = ['flamer']; ok(fireRange(p) === 22, 'downed with a Forged gun: 22 m'); p.down = 0; p.up = [];
  // the server's real flame reach is the same number: a zombie at 9.5 m is out of reach at base, in reach with Long Reach I (9.72 m)
  const burn = lvl => { for (let tries = 0; tries < 20; tries++) { const r = mk(1), p = [...r.players.values()][0]; r.wave = 1; r.toSpawn = 0; r.waveDelay = 99; r.zombies.clear();
      Object.assign(p, { guns: ['flamer'], slot: 0, up: [], bon: { range: lvl }, fuel: 100, cd: 0, inv: 99, pitch: 0 }); p.yaw = tries * 0.7; const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
      if (!Z.los(r, p.x, p.z, p.x + s * 10, p.z + c * 10, p.y)) continue; const z = { id: 990, ty: 0, x: p.x + s * 9.5, z: p.z + c * 9.5, hp: 1e6, maxhp: 1e6, sp: 0, win: null, ph: 0 }; r.zombies.set(990, z);
      p.in = { mx: 0, mz: 0, fire: true, turn: 0, yaw: p.yaw }; r.step(0.05); return z.hp < 1e6; } return null; };
  const b0 = burn(0), b1 = burn(1); ok(b0 === false && b1 === true, `flamer at 9.5 m: base misses (${b0}), Long Reach I hits (${b1})`); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
