// Helicopter finale (Night Shift ch. 4, free play + daily only, never ranked). Server-authoritative:
// flare lit -> bird inbound (~20 s, surge wave) -> lands on the rooftop pad, boarding open 60 s -> liftoff (short swarm) -> results.
// Board by standing on the pad. Boarded players are locked in their seat and protected (zombies ignore them).
// Leaves when a majority of ACTIVE players vote (away / timed-out / spectators never count), when every active player is aboard, or when the timer ends.
// Two door miniguns: a boarded player presses USE to man a free one; hits are resolved here with the PR 12 pitch aim.
const Z = require('./cod');
const INBOUND = 20, BOARD = 60, LIFT = 6, LEFT = 9, PAD_R = 4.2, MG_CD = 0.055, MG_DMG = 34, MG_RANGE = 46, MG_SPIN = 0.6, MG_LAT = 1.0;
const ST = { inbound: 1, board: 2, lift: 3, left: 4, done: 5 };
const q = v => Math.round(v * 10) / 10;
const active = (room, ps) => ps.filter(p => p.alive && !p.spectator && !p.away);   // ps already drops away/disconnected players
function padOf() { const d = Z.QDEF; if (!d || !d.pad) return null; return { x: Z.WX(d.pad[0]), z: Z.WZ(d.pad[1]) }; }   // WX/WZ are linear, so .5 lands on a cell edge
function start(room, ev) {
  if (room.ranked || room.heli) return; const pad = padOf(); if (!pad) return;
  const n = Math.max(1, [...room.players.values()].filter(p => !p.spectator && !p.away).length);
  room.heli = { st: ST.inbound, t: INBOUND, x: pad.x, z: pad.z, y: Z.UH + 0.4, b: new Set(), v: new Set(), g: [0, 0], spin: [0, 0], t0: room.t };
  room.toSpawn += Math.round((10 + room.wave * 2) * Z.scaleN(n)); room.waveTotal = Math.max(room.waveTotal || 0, room.toSpawn); room.spawnT = 0;   // surge while the bird is inbound
  ev.push({ e: 'heli', s: ST.inbound, t: INBOUND });
  ev.push({ e: 'note', n: 6, t: '📻 Ch. 4 · Pilot', x: 'Burn City, this is Kestrel-two. I see your flare. ETA twenty seconds. Hold that roof!' });
}
// fast aggressive variants (placeholder for the later stage: no climbing yet). Smash straight through boards.
function swarm(room, n, padOnly) { const h = room.heli; let made = 0;
  const wins = Z.WINDOWS.map((w, i) => i).filter(i => Z.winOn(room, i) && (!padOnly || Z.WINDOWS[i].zone === 8));
  if (!wins.length) return 0; const np = Math.max(1, [...room.players.values()].filter(p => !p.spectator).length);
  for (let k = 0; k < n && room.zombies.size < 60; k++) { const wi = wins[k % wins.length], w = Z.WINDOWS[wi]; room.boards[wi] = 0;
    const hp = (60 + room.wave * 15) * (room.mod?.hp || 1) * Z.hpN(np) * 0.8, sp = (2.2 + Math.min(room.wave * 0.25, 2.5)) * 1.9;
    room.zombies.set(room.zid, { id: room.zid++, ty: 1, x: w.ox + (w.ox - w.x) * (1 + k * 0.4), z: w.oz + (w.oz - w.z) * (1 + k * 0.4), lv: w.lv || 0, y: (w.lv || 0) * Z.UH, hp, maxhp: hp, sp, win: wi, ph: 0, agg: 1 }); made++; }
  if (h) h.swarmN = (h.swarmN || 0) + made; return made; }
function seat(h, p) { const i = p.mg; if (i === 0 || i === 1) return [h.x + (i ? 1.7 : -1.7), h.z + 0.2]; const k = [...h.b].indexOf(p.id); return [h.x + (k % 2 ? 0.55 : -0.55), h.z - 0.6 - (k >> 1) * 0.7]; }
function board(room, p, ev) { const h = room.heli; h.b.add(p.id); p.aboard = 1; p.mg = null; p.inv = 99; p.in.fire = false; ev.push({ e: 'hboard', id: p.id, n: h.b.size }); }
function depart(room, why, ev) { const h = room.heli; h.st = ST.lift; h.t = LIFT; h.why = why; ev.push({ e: 'heli', s: ST.lift, why }); swarm(room, 8, true); }
function finish(room, ps, ev) { const h = room.heli, all = [...room.players.values()].filter(p => !p.spectator);
  const left = all.filter(p => !h.b.has(p.id)), stat = p => ({ id: p.id, pts: p.pts | 0, kills: p.lifeKills | 0, wave: room.wave, secs: Math.round(room.t - (p.lifeStart || 0)) });
  for (const p of all) if (h.b.has(p.id)) ev.push({ e: 'hres', r: 'x', ...stat(p) });
  ev.push({ e: 'heli', s: ST.left, b: [...h.b] });
  // TODO(stage 2): hand h.b to a new map instance (room.migrate?.([...h.b], { from: room.M.name })) where the bird lands; left-behind players who die here respawn there after landing.
  const stuck = left.filter(p => p.alive);
  if (stuck.length) { h.st = ST.left; h.t = LEFT; swarm(room, 14, false); for (const p of stuck) ev.push({ e: 'hleft', id: p.id }); }   // a short brutal surge before the end
  else end(room, all, ev); }
function end(room, all, ev) { const h = room.heli; h.st = ST.done;
  for (const p of all) if (!h.b.has(p.id)) { ev.push({ e: 'hres', r: 'l', id: p.id, pts: p.pts | 0, kills: p.lifeKills | 0, wave: room.wave, secs: Math.round(room.t - (p.lifeStart || 0)) }); if (p.alive) { p.alive = false; p.down = 0; room.life(p); } }
  ev.push({ e: 'gameover', score: room.score, wave: room.wave, in: 8, heli: h.b.size }); room.over = 8; }
// returns true when the room should stop the rest of this tick (match ended)
function tick(room, ps, dt, ev) { const h = room.heli; if (!h || h.st === ST.done) return false;
  h.t -= dt;
  if (h.st === ST.inbound) { if (h.t <= 0) { h.st = ST.board; h.t = BOARD; ev.push({ e: 'heli', s: ST.board, t: BOARD }); } return false; }
  if (h.st === ST.board) {
    for (const p of ps) if (p.alive && !p.down && !p.spectator && !p.aboard && (p.lv || 0) === 1 && Math.hypot(p.x - h.x, p.z - h.z) < PAD_R) board(room, p, ev);
    const act = active(room, ps), aboard = act.filter(p => h.b.has(p.id)), votes = aboard.filter(p => h.v.has(p.id)).length;
    h.act = act.length; h.vn = votes;
    if (act.length && aboard.length === act.length) depart(room, 'all', ev);
    else if (votes * 2 > act.length) depart(room, 'vote', ev);
    else if (h.t <= 0) depart(room, 'time', ev);
    return false; }
  if (h.st === ST.lift) { h.y = Z.UH + 0.4 + Math.max(0, LIFT - h.t) * 0.9; if (h.t <= 0) finish(room, ps, ev); return h.st === ST.done; }
  if (h.st === ST.left) { if (h.t <= 0 || !ps.some(p => p.alive && !h.b.has(p.id))) { end(room, [...room.players.values()].filter(p => !p.spectator), ev); return true; } }
  return false; }
// a boarded player's tick (instead of walking/shooting): seat, vote, man/leave a minigun, fire it
function rider(room, p, dt, ev, A) { const h = room.heli; if (!h) { p.aboard = 0; return; }
  p.inv = 99; p.down = 0; p.firing = false;
  if (p.in.vote) { p.in.vote = false; if (h.st === ST.board && !h.v.has(p.id)) { h.v.add(p.id); ev.push({ e: 'hvote', id: p.id }); } }
  if (p.in.use) { p.in.use = false; if (p.mg != null) { h.g[p.mg] = 0; h.spin[p.mg] = 0; p.mg = null; ev.push({ e: 'hgun', id: p.id, g: -1 }); }
    else if (h.st <= ST.lift) { const i = h.g.indexOf(0); if (i >= 0) { h.g[i] = p.id; p.mg = i; ev.push({ e: 'hgun', id: p.id, g: i }); } } }
  { const [sx, sz] = seat(h, p); p.x = sx; p.z = sz; p.y = h.y; p.lv = 1; }   // after USE, so a fresh gunner fires from the door seat this tick
  if (p.mg == null || h.st > ST.lift) return; const i = p.mg, fire = !!p.in.fire;
  h.spin[i] = Math.max(0, Math.min(1, h.spin[i] + (fire ? dt : -dt * 0.7) / MG_SPIN));
  if (!fire || h.spin[i] < 1) { p.mgCd = 0; return; }
  p.firing = true; p.mgCd = (p.mgCd || 0) - dt; let n = 0;
  while (p.mgCd <= 0 && n < 4) { p.mgCd += MG_CD; n++;
    const yaw = p.yaw + (Math.random() - 0.5) * 0.035, s = Math.sin(yaw), c = Math.cos(yaw); let hit = null, hd = A.reachH(p, MG_RANGE);
    for (const zb of room.zombies.values()) { if (zb.win != null && zb.ph < 1) continue; const dx = zb.x - p.x, dz = zb.z - p.z, along = dx * s + dz * c, lat = Math.abs(dx * c - dz * s);
      if (along > 0 && along < hd && lat < MG_LAT && A.vAim(p, zb, along) && Z.los(room, p.x, p.z, zb.x, zb.z, Math.min(p.y, Z.UH), zb.y)) { hd = along; hit = zb; hit._lat = lat; hit._hv = A.hsV(p, zb, along); } }
    if (hit) { A.hurt(hit, MG_DMG, p, hit._lat < 0.35 && hit._hv ? 1.6 : 0); h.hits = (h.hits || 0) + 1; }
    h.shots = (h.shots || 0) + 1;
    if (h.shots % 2) { const d = hit ? hd : A.missD(p, A.reachH(p, MG_RANGE)), ex = p.x + s * d, ez = p.z + c * d;
      ev.push({ e: 'shot', id: p.id, w: 'minigun', x: q(p.x), z: q(p.z), y: q(p.y), tx: q(ex), tz: q(ez), ty: hit ? q((hit.y || 0) + 1) : q(A.endY(p, d)), ray: 1, g: i, hit: hit ? 1 : 0 }); } } }
// snapshot: [state, secs left, boarded ids, votes, active count, gunner ids, spin x10, x, z, y]
function snap(room) { const h = room.heli; if (!h) return undefined; return [h.st, Math.max(0, Math.ceil(h.t)), [...h.b], h.vn | 0, h.act | 0, h.g.slice(), h.spin.map(v => Math.round(v * 10)), q(h.x), q(h.z), q(h.y)]; }
function reset(room) { room.heli = null; for (const p of room.players.values()) { p.aboard = 0; p.mg = null; } }
module.exports = { start, tick, rider, snap, reset, swarm, ST, PAD_R, INBOUND, BOARD };
