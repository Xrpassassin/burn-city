// "Night Shift" radio quest (free play + daily, not ranked): between rounds a radio transmission from the refinery's night foreman
// points the squad at the next part (valve wheel -> igniter fuse -> key card). Carry each one to the flare console; finishing the chain
// lights the flare stack and pays out. Server-authoritative per match: one shared state per room, so it works the same solo or in co-op.
const Z = require('./cod');
const ITEMS = [null, { k: 'valve', n: 'Valve Wheel', ic: '🔧' }, { k: 'fuse', n: 'Igniter Fuse', ic: '⚡' }, { k: 'card', n: "Foreman's Key Card", ic: '💳' }];
const PICK_R = 1.5, USE_R = 3, LV_TOL = 1.4, REWARD_PTS = 2000;
// stage: 0 waiting for the first radio call, 1/3/5 an item is out, 2/4 part fitted (next call at the next round break), 6 done
const NOTES = [null,
  (z, c) => ({ t: '📻 Ch. 3 · Night Shift', x: `…anyone still breathing out there? This is Varga, night foreman. The flare stack's gone cold, and that's why they keep coming. Somebody dragged the pressure valve wheel off to the ${z}. Get it onto the flare console in the ${c} and we can start the burn.` }),
  (z) => ({ t: '📻 Ch. 3 · Varga', x: `Pressure's holding. Good work. Next is the igniter fuse. The spare blew clean across the plant, last seen in the ${z}. Bring it back to the console. And keep away from the vents.` }),
  (z) => ({ t: '📻 Ch. 3 · Varga (static)', x: `…kzzt… ignition needs a foreman's key card. Mine's on what's left of Dekker, in the ${z}. Something big has been sitting on him. Grab it and run it to the console. Don't stop.` }),
];
function zoneName(x, z, lv) { const v = Z.cellAt(x, z, lv); const zn = Z.ZONES[v >= 100 ? -1 : v]; return zn ? zn.n.replace(/^The /, '') : 'refinery'; }
function init(room) {
  room.quest = null; const d = Z.QDEF; if (!d || room.ranked) return;
  const [c, r, dx, dz, lv = 0] = d.console, x = Z.WX(c) + dx * 0.55, z = Z.WZ(r) + dz * 0.55;
  room.quest = { st: 0, it: null, con: { x, z, lv, face: Math.atan2(-dx, -dz) }, zones: d.zones, note: null, brk: -1 };
}
// a random open floor cell inside one of the step's rooms (upper-level rooms use the upper grid; never on a ramp or a door)
function spotIn(zs) { const UPG = Z.UPG, out = [];
  for (const zi of zs) { const zn = Z.ZONES[zi]; if (!zn) continue; const lv = zn.lv ? 1 : 0, G = lv ? UPG : Z.M.GRID; if (!G) continue;
    for (let r = zn.r[2]; r <= zn.r[3]; r++) for (let c = zn.r[0]; c <= zn.r[1]; c++) { if (G[r][c] !== zi) continue; const x = Z.WX(c), z = Z.WZ(r); if (Z.onRamp(x, z)) continue;
      let open = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ((G[r + b]?.[c + a] ?? -1) === zi) open++; if (open >= 3) out.push([x, z, lv]); } }
  return out.length ? out[Math.floor(Math.random() * out.length)] : null; }
function call(room, ev) { const q = room.quest, step = (q.st >> 1) + 1, kind = step, zs = q.zones[step - 1] || q.zones[0], sp = spotIn(zs) || spotIn([1]);
  if (!sp) return; q.it = { kind, x: sp[0], z: sp[1], lv: sp[2], by: null }; q.st = step * 2 - 1;
  const nt = NOTES[step](zoneName(sp[0], sp[1], sp[2]), zoneName(q.con.x, q.con.z, q.con.lv)); q.note = { n: step, ...nt };
  ev.push({ e: 'note', n: step, t: nt.t, x: nt.x, it: ITEMS[kind].n, ic: ITEMS[kind].ic }); }
// called every tick while the wave is between rounds (no zombies left to spawn or alive)
function onBreak(room, ev) { const q = room.quest; if (!q || q.brk === room.wave || room.wave < 2) return; q.brk = room.wave;
  if (q.st === 0 || q.st === 2 || q.st === 4) call(room, ev);
  else if (q.it && q.note) ev.push({ e: 'note', n: q.note.n, t: q.note.t, x: q.note.x, it: ITEMS[q.it.kind].n, ic: ITEMS[q.it.kind].ic, again: 1 }); }   // unfinished step: replay the call as a reminder
function tick(room, ps, ev) { const q = room.quest; if (!q || !q.it) return; const it = q.it;
  if (it.by != null) { const p = room.players.get(it.by);
    if (!p || !p.alive || p.down || p.away) { it.by = null; if (p) { it.x = p.x; it.z = p.z; it.lv = p.lv || 0; } ev.push({ e: 'qdrop', k: it.kind, x: Math.round(it.x * 10) / 10, z: Math.round(it.z * 10) / 10 }); }
    else { it.x = p.x; it.z = p.z; it.lv = p.lv || 0; } return; }
  for (const p of ps) { if (!p.alive || p.down || p.spectator) continue; if (Math.hypot(p.x - it.x, p.z - it.z) > PICK_R || Math.abs((p.y || 0) - it.lv * Z.UH) > LV_TOL) continue;
    it.by = p.id; ev.push({ e: 'qpick', id: p.id, k: it.kind, n: ITEMS[it.kind].n, ic: ITEMS[it.kind].ic });
    if (it.kind === 3 && !it.warden) { it.warden = 1; warden(room, ev); } break; } }
// the key card was being "sat on": picking it up wakes a Cinder Warden (a Juggernaut at 60% health) that comes in through a window
function warden(room, ev) { const wi = Z.windowSpawn(room), w = Z.WINDOWS[wi]; if (!w) return; const n = Math.max(1, [...room.players.values()].filter(p => !p.spectator && !p.away).length);
  const hp = (60 + room.wave * 15) * (room.mod?.hp || 1) * Z.hpN(n) * 7 * 0.6, sp = 2.4 + Math.min(room.wave * 0.25, 2.5);
  room.zombies.set(room.zid, { id: room.zid++, ty: 3, x: w.ox + (w.ox - w.x) * 2, z: w.oz + (w.oz - w.z) * 2, lv: w.lv || 0, y: (w.lv || 0) * Z.UH, hp, maxhp: hp, sp: sp * 0.55, win: wi, ph: 0, warden: 1 });
  ev.push({ e: 'warden' }); }
function use(room, p, ev) { const q = room.quest; if (!q || !q.it || q.it.by !== p.id) return false; const c = q.con;
  if (Math.hypot(p.x - c.x, p.z - c.z) > USE_R || Math.abs((p.y || 0) - c.lv * Z.UH) > LV_TOL) return false;
  const k = q.it.kind; q.it = null; q.st = k * 2; ev.push({ e: 'qfit', id: p.id, k, n: ITEMS[k].n });
  if (k === 3) { q.st = 6; q.note = null;   // flare stack lit: everyone standing gets points + a free reforge of the gun in hand (or a perk if it's already forged)
    for (const o of room.players.values()) { if (!o.alive || o.spectator) continue; o.pts += REWARD_PTS; const w = o.guns?.[o.slot]; o.up ||= []; let gift = 'pts';
      if (w && !o.up.includes(w)) { o.up.push(w); o.fuel = 100; gift = 'forge'; }
      else { let n = 0; for (let v = o.perks; v; v >>= 1) n += v & 1; const free = Z.PERKS.filter(pk => !(o.perks & Z.PB[pk.k])); if (n < Z.MAX_PERKS && free.length) { const pk = free[Math.floor(Math.random() * free.length)]; o.perks |= Z.PB[pk.k]; gift = pk.k; } else o.pts += 1500; }
      ev.push({ e: 'qreward', id: o.id, pts: REWARD_PTS, gift, w }); }
    ev.push({ e: 'qdone', x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10 }); }
  return true; }
const q1 = v => Math.round(v * 10) / 10;
// snapshot: [stage, item kind (0 none), item x, item z, item floor, carrier id (0 none), console x, console z, console floor, console facing]
function snap(room) { const q = room.quest; if (!q) return undefined; const it = q.it, c = q.con;
  return [q.st, it ? it.kind : 0, it ? q1(it.x) : 0, it ? q1(it.z) : 0, it ? it.lv : 0, it && it.by != null ? it.by : 0, q1(c.x), q1(c.z), c.lv, Math.round(c.face * 100) / 100]; }
module.exports = { init, onBreak, tick, use, snap, ITEMS };
