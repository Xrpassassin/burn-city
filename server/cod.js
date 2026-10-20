// Zombie Survival "COD-zombies" layer: in-game points (no real money, never purchasable), doors that open map zones,
// weapons (wall-buys + mystery box), perk machines, downed/revive. Everything server-authoritative; clients only send
// intents (use / swap) and the server checks distance, points and state.
const WEAPONS = [
  { id: 'flamer', name: 'Flamethrower', kind: 'cone', range: 9, cos: Math.cos(0.35), dps: 70, use: 22, regen: 14 },
  { id: 'dragon', name: "Dragon's Breath", kind: 'cone', range: 10.5, cos: Math.cos(0.55), dps: 92, use: 26, regen: 14 },
  { id: 'shotgun', name: 'Fire Shotgun', kind: 'burst', range: 8, cos: Math.cos(0.5), dmg: 95, cd: 0.75, use: 14, regen: 16 },
  { id: 'napalm', name: 'Firestorm', kind: 'ray', dmg: 70, range: 26, splash: 1.6, cd: 0.45, use: 12, regen: 14 },   // id kept as 'napalm' so existing owners/slots migrate automatically
  { id: 'beam', name: 'Inferno Beam', kind: 'beam', range: 22, width: 0.9, dps: 130, use: 30, regen: 12 },
];
const WI = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));
// Inferno Forge (this map's upgrade machine): reforges the weapon in hand once: +70% damage, +15% range, 30% less fuel, faster cycling
const UPNAME = { flamer: 'Hellfire Torch', dragon: "Wyrm's Fury", shotgun: 'Magma Scattergun', napalm: 'Supernova', beam: 'Solar Lance' };
const UPW = Object.fromEntries(WEAPONS.map(w => [w.id, { ...w, name: UPNAME[w.id] || 'Forged ' + w.name, up: 1, dps: w.dps && w.dps * 1.7, dmg: w.dmg && w.dmg * 1.7, range: w.range * 1.15, use: w.use * 0.7, cd: w.cd && w.cd * 0.8, splash: w.splash && w.splash * 1.3 }]));
// ===== The BURN Refinery: hand-built indoor map on a 2 m grid (40 x 32 cells = 80 x 64 m) =====
// cell codes: -1 wall/obstacle, 0..6 floor of that room, 100+d door d (walkable once open)
const CELL = 2, GW = 40, GH = 32, MapGen = require('./mapgen');
const WX = c => (c - GW / 2) * CELL + 1, WZ = r => (r - GH / 2) * CELL + 1;
// props sit on a floor cell, pushed against the wall behind them (dx/dz)
const at = (c, r, dx = 0, dz = 0) => ({ x: WX(c) + dx * 0.55, z: WZ(r) + dz * 0.55, face: Math.atan2(-dx, -dz) });
const PERKINFO = { jug: { name: 'Ember Armor', desc: '250 max health', cost: 2500, col: '#ff3030' }, quick: { name: 'Quick Fuel', desc: 'Faster fuel refill and reload', cost: 2000, col: '#30c0ff' },
  speed: { name: 'Fire Walk', desc: 'Faster movement', cost: 2000, col: '#30ff70' }, revive: { name: 'Phoenix Revive', desc: 'Revive teammates fast · solo: revive yourself once', cost: 1500, col: '#ffd030' },
  dbl: { name: 'Double Burn', desc: 'Double damage', cost: 3000, col: '#c040ff' } };
const PERK_KEYS = ['jug', 'quick', 'speed', 'revive', 'dbl'];
// ===== The BURN Refinery: the hand-built classic map (ranked + daily keep it so everyone plays the same layout) =====
// cell codes: -1 wall/obstacle, 0..n floor of that room, 100+d door d (walkable once open)
const CLASSIC = { name: 'The BURN Refinery', env: null,
  zones: [{ n: 'Spawn Bay', r: [16, 23, 21, 30], col: '#ff8a3a' }, { n: 'Main Corridor', r: [1, 38, 17, 19], col: '#d8a060' },
    { n: 'Control Room', r: [1, 14, 21, 30], col: '#36c8ff' }, { n: 'Warehouse', r: [25, 38, 21, 30], col: '#e0b070' },
    { n: 'Lab', r: [1, 12, 1, 15], col: '#5cff9a' }, { n: 'Furnace Hall', r: [27, 38, 1, 15], col: '#ff4a1a' }, { n: 'Courtyard', r: [14, 25, 1, 15], col: '#b47aff' }],
  obst: [[18, 18, 24, 24, 3.2, 'pillar'], [21, 21, 24, 24, 3.2, 'pillar'], [18, 18, 27, 27, 3.2, 'pillar'], [21, 21, 27, 27, 3.2, 'pillar'],
    [3, 6, 23, 23, 1.1, 'desk'], [9, 12, 23, 23, 1.1, 'desk'], [3, 6, 27, 27, 1.1, 'desk'], [9, 12, 27, 27, 1.1, 'desk'],
    [27, 28, 23, 24, 2.2, 'crate'], [31, 32, 23, 24, 2.2, 'crate'], [35, 36, 23, 24, 2.2, 'crate'], [27, 28, 27, 28, 2.2, 'crate'], [31, 32, 27, 28, 2.2, 'crate'], [35, 36, 27, 28, 2.2, 'crate'],
    [3, 10, 4, 4, 1.1, 'bench'], [3, 10, 8, 8, 1.1, 'bench'], [3, 10, 12, 12, 1.1, 'bench'],
    [29, 31, 4, 6, 2.6, 'furnace'], [34, 36, 4, 6, 2.6, 'furnace'], [29, 31, 10, 12, 2.6, 'furnace'], [34, 36, 10, 12, 2.6, 'furnace'],
    [18, 21, 6, 9, 2.2, 'tank'], [8, 9, 17, 17, 3.2, 'pipe'], [29, 30, 19, 19, 3.2, 'pipe']],
  doordef: [[0, 1, [[19, 20], [20, 20]], 750], [1, 2, [[7, 20], [8, 20]], 1000], [1, 3, [[31, 20], [32, 20]], 1000], [1, 4, [[6, 16], [7, 16]], 1250],
    [1, 5, [[32, 16], [33, 16]], 1250], [4, 6, [[13, 7], [13, 8]], 1500], [5, 6, [[26, 7], [26, 8]], 1500]],
  // boarded windows in exterior walls: wall cell + outward direction
  windef: [[18, 31, 0, 1], [21, 31, 0, 1], [0, 24, -1, 0], [0, 28, -1, 0], [6, 31, 0, 1], [39, 24, 1, 0], [39, 28, 1, 0], [32, 31, 0, 1],
    [0, 5, -1, 0], [0, 11, -1, 0], [6, 0, 0, -1], [17, 0, 0, -1], [22, 0, 0, -1], [39, 5, 1, 0], [39, 11, 1, 0], [32, 0, 0, -1], [0, 18, -1, 0], [39, 18, 1, 0]],
  wallbuys: [{ w: 'shotgun', cost: 500, s: [16, 25, -1, 0] }, { w: 'dragon', cost: 1000, s: [14, 17, 0, -1] }, { w: 'napalm', cost: 1500, s: [38, 25, 1, 0] }],
  box: [[4, 19, 0, 1], [13, 29, 1, 0], [37, 22, 0, -1], [2, 2, -1, 0], [37, 14, 1, 0], [15, 14, -1, 0]],
  forge: [32, 1, 0, -1], power: null,
  perks: { jug: [1, 30, -1, 0], quick: [25, 30, -1, 0], speed: [38, 17, 1, 0], revive: [23, 30, 1, 0], dbl: [25, 1, 1, 0] } };
if (process.env.ZOMBIE_TEST_PROPS && !process.env.FLY_APP_NAME) { CLASSIC.box.push([17, 22, 1, 0]); CLASSIC.forge = [22, 22, 1, 0]; }   // local screenshot runs only
const FORGE_COST = +process.env.ZOMBIE_FORGE_COST || 5000;
function build(def, kind) {
  const GRID = def.grid ? def.grid.map(r => r.slice()) : (() => { const G = []; for (let r = 0; r < GH; r++) G.push(new Array(GW).fill(-1));
    def.zones.forEach((z, i) => { for (let r = z.r[2]; r <= z.r[3]; r++) for (let c = z.r[0]; c <= z.r[1]; c++) G[r][c] = i; });
    for (const [c0, c1, r0, r1] of def.obst) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) G[r][c] = -1; return G; })();
  const DOORS = def.doordef.map(([a, b, cells, cost], d) => { for (const [c, r] of cells) GRID[r][c] = 100 + d;
    const x = cells.reduce((s, [c]) => s + WX(c), 0) / cells.length, z = cells.reduce((s, [, r]) => s + WZ(r), 0) / cells.length;
    return { a, b, cells, cost, x, z, ax: cells[0][1] === cells[1][1] ? 'x' : 'z' }; });
  const WINDOWS = def.windef.map(([c, r, nx, nz]) => { const x = WX(c), z = WZ(r); return { zone: GRID[r - nz][c - nx], c, r, x, z, ox: x + nx * 1.6, oz: z + nz * 1.6, ix: x - nx * 2.2, iz: z - nz * 2.2, ax: nz ? 'x' : 'z' }; });
  // line of sight for flames: tall walls and closed doors block, low desks/benches and boarded windows don't
  const SEE = GRID.map(row => row.map(() => 0)); for (const [c0, c1, r0, r1, h] of def.obst) if (h < 1.5) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) SEE[r][c] = 1;
  for (const w of def.windef) SEE[w[1]][w[0]] = 1;
  const P = s => at(...s);
  return { kind, name: def.name, env: def.env, seed: def.seed, GRID, SEE, DOORS, WINDOWS, ZONES: def.zones, OBST: def.obst,
    WALLBUYS: def.wallbuys.map(w => ({ w: w.w, cost: w.cost, ...P(w.s) })), BOX_SPOTS: def.box.map(s => { const p = P(s); return [p.x, p.z, p.face]; }),
    FORGE: { ...P(def.forge), cost: FORGE_COST, name: 'Inferno Forge' }, POWER: def.power ? { ...P(def.power), name: 'Power Switch' } : null,
    PERKS: PERK_KEYS.map(k => ({ k, ...PERKINFO[k], ...P(def.perks[k]) })) };
}
const CLASSIC_M = build(CLASSIC, 'classic');
let M, GRID, SEE, DOORS, WINDOWS, ZONES, OBST, WALLBUYS, BOX_SPOTS, FORGE, POWER, PERKS;
function use_(m) { M = m; ({ GRID, SEE, DOORS, WINDOWS, ZONES, OBST, WALLBUYS, BOX_SPOTS, FORGE, POWER, PERKS } = m); }
use_(CLASSIC_M);
// ranked + daily rooms always play the classic Refinery (same layout for everyone on a leaderboard); free play gets a new map per match
const wantsClassic = room => !!(room.ranked || room.daily || process.env.ZOMBIE_CLASSIC === '1');
function newMap(room) { if (wantsClassic(room)) return CLASSIC_M; const d = MapGen.gen((Math.random() * 2 ** 31) | 0); return d ? build(d, 'proc') : CLASSIC_M; }
// every entry point that touches the map binds the room's own layout first (rooms run one at a time, so a module-level binding is safe)
function bind(room) { if (!room) return use_(CLASSIC_M); if (!room.M || (wantsClassic(room) && room.M.kind !== 'classic')) { resetMap(room); return; } if (M !== room.M) use_(room.M); }
const cellAt = (x, z) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); return r < 0 || r >= GH || c < 0 || c >= GW ? -1 : GRID[r][c]; };
const doorOpen = (room, d) => unlocked(room, DOORS[d].a) && unlocked(room, DOORS[d].b);
const walkCode = (room, v) => v >= 100 ? doorOpen(room, v - 100) : v >= 0 && unlocked(room, v);
const walk = (room, x, z) => walkCode(room, cellAt(x, z));
// line of sight for flames: tall walls and closed doors block, low desks/benches and boarded windows don't
function los(room, x0, z0, x1, z1) { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.7);
  for (let k = 1; k < n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n, c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2);
    if (r < 0 || r >= GH || c < 0 || c >= GW) continue; const v = GRID[r][c]; if (v >= 100 ? !doorOpen(room, v - 100) : v < 0 && !SEE[r][c]) return false; } return true; }
// flow field: BFS distance (in cells) from every standing player, over walkable cells; zombies descend it
function flow(room, ps) { const D = room.flowD || (room.flowD = new Float32Array(GW * GH)); D.fill(1e9); const q = [];
  for (const p of ps) { const c = Math.floor(p.x / CELL + GW / 2), r = Math.floor(p.z / CELL + GH / 2); if (r >= 0 && r < GH && c >= 0 && c < GW && D[r * GW + c] > 0) { D[r * GW + c] = 0; q.push(r * GW + c); } }
  for (let h = 0; h < q.length; h++) { const i = q[h], c = i % GW, r = (i - c) / GW;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue; const j = nr * GW + nc;
      if (D[j] <= D[i] + 1 || !walkCode(room, GRID[nr][nc])) continue; D[j] = D[i] + 1; q.push(j); } } }
// next waypoint for a zombie at (x,z): centre of the best neighbour cell (diagonals only when both sides are open)
function nextStep(room, x, z) { const D = room.flowD; if (!D) return null; const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); if (r < 0 || r >= GH || c < 0 || c >= GW) return null;
  let best = D[r * GW + c], bc = -1, br = -1; const ok = (cc, rr) => cc >= 0 && rr >= 0 && cc < GW && rr < GH && walkCode(room, GRID[rr][cc]);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dc && !dr) continue; const nc = c + dc, nr = r + dr; if (!ok(nc, nr)) continue; if (dc && dr && !(ok(c + dc, r) && ok(c, r + dr))) continue;
    const v = D[nr * GW + nc] + (dc && dr ? 0.4 : 0); if (v < best) { best = v; bc = nc; br = nr; } }
  return bc < 0 ? null : [WX(bc), WZ(br), D[r * GW + c]]; }
const BOX_COST = 950, BOX_POOL = ['dragon', 'shotgun', 'napalm', 'beam'];
const BOARDS = 6, BOARD_PTS = 10, REPAIR_CAP = 500, REPAIR_T = 0.75, TEAR_T = 1.1;
const MAX_PERKS = 4, START_PTS = +process.env.ZOMBIE_START_POINTS || 500,   // env override is for local testing only
  USE_R = 3, REVIVE_R = 2.6;
const PB = Object.fromEntries(PERKS.map((p, i) => [p.k, 1 << i]));
const layout = () => ({ grid: GRID, cell: CELL, gw: GW, gh: GH, obst: OBST, windows: WINDOWS, boards: BOARDS, repairCap: REPAIR_CAP, zones: ZONES, doors: DOORS, wallbuys: WALLBUYS, box: BOX_SPOTS, boxCost: BOX_COST, forge: FORGE, power: POWER, name: M.name, env: M.env, kind: M.kind, perks: PERKS, weapons: WEAPONS.map(w => ({ id: w.id, name: w.name, kind: w.kind, up: UPW[w.id].name })), maxPerks: MAX_PERKS });

const WIN_MAX = 2, WIN_GAP = 1.3, RUNNER = 1.4;   // runner speed mult (was 1.7)
const scaleN = n => n <= 1 ? 0.75 : Math.min(1.9, 0.7 + 0.3 * n), hpN = n => n <= 1 ? 0.85 : Math.min(1.5, 0.8 + 0.12 * n), waveGap = n => n <= 1 ? 12 : Math.max(8, 12 - (n - 1));
function resetMap(room) { room.M = newMap(room); use_(room.M); room.power = POWER ? 0 : 1; room.flowD = null; room.boards = WINDOWS.map(() => BOARDS); room.winLast = WINDOWS.map(() => -99); room.zt = 0; room.open = 1; room.box = { spot: process.env.ZOMBIE_TEST_BOX ? Math.min(+process.env.ZOMBIE_TEST_BOX, BOX_SPOTS.length - 1) : 0, state: 0, t: 0, uses: 0, moveAfter: 4 + Math.floor(Math.random() * 4) }; room.proj = []; room.pools = []; }
const unlocked = (room, z) => (room.open >> z) & 1;
const inside = (room, x, z, m = 0.42) => walk(room, x + m, z + m) && walk(room, x - m, z + m) && walk(room, x + m, z - m) && walk(room, x - m, z - m);   // body-radius collision vs walls / closed doors
const winOn = (room, i) => unlocked(room, WINDOWS[i].zone);
function windowSpawn(room) { const ok = WINDOWS.map((w, i) => i).filter(i => winOn(room, i)); return ok[Math.floor(Math.random() * ok.length)]; }
function zoneSpawn() {   // player spawn: a free cell in the Spawn Bay
  for (;;) { const z = ZONES[0].r, c = z[0] + Math.floor(Math.random() * (z[1] - z[0] + 1)), r = z[2] + Math.floor(Math.random() * (z[3] - z[2] + 1)); if (GRID[r][c] === 0) return [WX(c) + (Math.random() - .5), WZ(r) + (Math.random() - .5)]; } }
function initPlayer(p) { p.usedSelf = false; p.pts = START_PTS; p.ptsAcc = 0; p.guns = process.env.ZOMBIE_TEST_GUN && !process.env.FLY_APP_NAME ? ['flamer', process.env.ZOMBIE_TEST_GUN] : ['flamer'];   // test gun: local screenshot runs only
 p.slot = 0; p.perks = 0; p.cd = 0; p.down = 0; p.up = []; p.bon = {}; p.draft = null; }
const wpn = p => { const w = WEAPONS[WI[p.guns[p.slot]] ?? 0]; return p.up && p.up.includes(w.id) ? UPW[w.id] : w; };
const upBits = p => (p.up && p.up.includes(p.guns[p.slot]) ? 1 : 0) | (p.up && p.guns[1 - p.slot] && p.up.includes(p.guns[1 - p.slot]) ? 2 : 0);
const has = (p, k) => p.perks & PB[k];
function give(p, w) { if (p.guns.includes(w)) { p.slot = p.guns.indexOf(w); p.fuel = 100; return; } if (p.guns.length < 2) { p.guns.push(w); p.slot = 1; } else { if (p.up) p.up = p.up.filter(u => u !== p.guns[p.slot]); p.guns[p.slot] = w; } p.fuel = 100; p.cd = 0; }
function spend(p, c) { if (p.pts < c) return false; p.pts -= c; return true; }
// one "use" press: the nearest interactable in range, validated here
function use(room, p, ev) {
  const near = (x, z, r = USE_R) => Math.hypot(p.x - x, p.z - z) <= r;
  if (WINDOWS.some((w, i) => winOn(room, i) && room.boards[i] < BOARDS && Math.hypot(p.x - w.ix, p.z - w.iz) < 2.6)) return;   // near a broken window F does nothing (rebuild is automatic), never a purchase
  for (let i = 0; i < DOORS.length; i++) { const d = DOORS[i], ua = unlocked(room, d.a), ub = unlocked(room, d.b); if (ua === ub || !near(d.x + (d.ax === 'z' ? 0 : 0), d.z, 22)) continue;
    const along = d.ax === 'x' ? Math.abs(p.x - d.x) : Math.abs(p.z - d.z), across = d.ax === 'x' ? Math.abs(p.z - d.z) : Math.abs(p.x - d.x); if (along > 3 || across > USE_R) continue;
    if (!spend(p, d.cost)) return ev.push({ e: 'nopts', id: p.id }); const nz = ua ? d.b : d.a; room.open |= 1 << nz; return ev.push({ e: 'door', i, z: nz, by: p.id, open: room.open }); }
  for (const w of WALLBUYS) if (near(w.x, w.z)) { const own = p.guns.includes(w.w), c = own ? Math.round(w.cost / 2) : w.cost; if (!spend(p, c)) return ev.push({ e: 'nopts', id: p.id }); give(p, w.w); return ev.push({ e: 'buy', id: p.id, w: w.w }); }
  const b = room.box, bs = BOX_SPOTS[b.spot];
  if (b.state === 0 && near(bs[0], bs[1])) { if (!spend(p, BOX_COST)) return ev.push({ e: 'nopts', id: p.id }); b.uses++;
    if (b.uses >= b.moveAfter && (Math.random() < 0.5 || b.uses >= b.moveAfter + 3)) { p.pts += BOX_COST; b.state = 2; b.t = 8; b.uses = 0; b.moveAfter = 4 + Math.floor(Math.random() * 4); return ev.push({ e: 'box_move', id: p.id, spot: b.spot }); }
    const pool = BOX_POOL.filter(w => !p.guns.includes(w)), w = pool[Math.floor(Math.random() * pool.length)] || 'dragon';
    b.state = 1; b.t = 2.5; b.by = p.id; b.w = w; return ev.push({ e: 'box_roll', id: p.id, w, spot: b.spot }); }
  if (POWER && near(POWER.x, POWER.z)) { if (room.power) return; room.power = 1; return ev.push({ e: 'power', id: p.id }); }
  if (near(FORGE.x, FORGE.z)) { if (!room.power) return ev.push({ e: 'nopower', id: p.id }); const w = p.guns[p.slot]; p.up ||= []; if (p.up.includes(w)) return ev.push({ e: 'forge_have', id: p.id });
    if (!spend(p, FORGE.cost)) return ev.push({ e: 'nopts', id: p.id }); p.up.push(w); p.fuel = 100; p.cd = 0; return ev.push({ e: 'forge', id: p.id, w }); }
  for (const k of PERKS) if (near(k.x, k.z)) { if (has(p, k.k)) return; if (!room.power) return ev.push({ e: 'nopower', id: p.id }); let n = 0; for (let v = p.perks; v; v >>= 1) n += v & 1; if (n >= MAX_PERKS) return ev.push({ e: 'perkmax', id: p.id });
    if (!spend(p, k.cost)) return ev.push({ e: 'nopts', id: p.id }); p.perks |= PB[k.k]; if (k.k === 'jug') p.hp = Math.min(250, p.hp + 150); return ev.push({ e: 'perk', id: p.id, k: k.k }); }
}
function tickBox(room, ev) { const b = room.box; if (!b.state) return; if ((b.t -= room.dtNow) > 0) return;
  if (b.state === 1) { const p = room.players.get(b.by); if (p && p.alive && !p.down) { give(p, b.w); ev.push({ e: 'box_give', id: p.id, w: b.w }); } b.state = 0; }
  else { let s; do s = Math.floor(Math.random() * BOX_SPOTS.length); while (s === b.spot && BOX_SPOTS.length > 1); b.spot = s; b.state = 0; ev.push({ e: 'box_here', spot: s }); } }
// zombie at a window: tear boards one at a time, then climb in. Returns true while still outside.
function atWindow(room, zb, dt, ev) { if (zb.win == null) return false; const w = WINDOWS[zb.win];
  if (zb.ph === 0) { const dx = w.ox - zb.x, dz = w.oz - zb.z, d = Math.hypot(dx, dz); if (d > 0.3) { zb.x += dx / d * Math.min(d, zb.sp * dt); zb.z += dz / d * Math.min(d, zb.sp * dt); return true; }
    if (room.boards[zb.win] > 0) { if ((zb.tear = (zb.tear ?? TEAR_T) - dt) <= 0) { zb.tear = TEAR_T; room.boards[zb.win]--; ev.push({ e: 'rip', i: zb.win, n: room.boards[zb.win] }); } return true; }
    // per-window throttle: max WIN_MAX climbing at once and WIN_GAP s between entries; the rest mill outside
    const zs = room.zombies ? [...room.zombies.values()] : [], climbing = zs.filter(o => o.win === zb.win && o.ph === 1).length;
    const ahead = zs.some(o => o !== zb && o.win === zb.win && o.ph === 0 && o.wq != null && o.wq < (zb.wq ?? (zb.wq = room.zt)) && Math.hypot(w.ox - o.x, w.oz - o.z) < 2.5);
    if (climbing >= WIN_MAX || room.zt - room.winLast[zb.win] < WIN_GAP || ahead) { zb.wq ??= room.zt; const k = (zb.id % 5) - 2, ox = w.ox - w.x, oz = w.oz - w.z, l = Math.hypot(ox, oz) || 1;
      zb.x += ((w.ox + ox / l * 1.4 + (-oz / l) * k * 0.7) - zb.x) * Math.min(1, dt * 3); zb.z += ((w.oz + oz / l * 1.4 + (ox / l) * k * 0.7) - zb.z) * Math.min(1, dt * 3); return true; }
    room.winLast[zb.win] = room.zt; zb.wq = null; zb.ph = 1; }
  const dx = w.ix - zb.x, dz = w.iz - zb.z, d = Math.hypot(dx, dz); if (d > 0.3) { zb.x += dx / d * Math.min(d, zb.sp * dt); zb.z += dz / d * Math.min(d, zb.sp * dt); return true; }
  zb.win = null; return false; }
// player holding USE next to a damaged window: one board per REPAIR_T, 10 pts each up to REPAIR_CAP per wave
function repair(room, p, dt, ev) { if (!p.alive || p.down || p.in.fire) { p.repT = 0; return; }   // automatic: stand near a damaged window, not firing
  let best = -1, bd = 2.6; WINDOWS.forEach((w, i) => { const d = Math.hypot(p.x - w.ix, p.z - w.iz); if (d < bd && room.boards[i] < BOARDS && winOn(room, i)) { bd = d; best = i; } });
  if (best < 0) { p.repT = 0; return; } if ((p.repT = (p.repT || 0) + dt) < REPAIR_T) return; p.repT = 0;
  room.boards[best]++; if (p.repWave !== room.wave) { p.repWave = room.wave; p.repPts = 0; } const pts = Math.min(BOARD_PTS, REPAIR_CAP - p.repPts); p.pts += pts; p.repPts += pts;
  ev.push({ e: 'board', i: best, n: room.boards[best], by: p.id, pts }); }
module.exports = { RUNNER, scaleN, hpN, waveGap, los, flow, nextStep, walk, cellAt, CELL, get WINDOWS() { return WINDOWS; }, windowSpawn, atWindow, repair, WEAPONS, WI, get ZONES() { return ZONES; }, get DOORS() { return DOORS; }, get PERKS() { return PERKS; }, PB, bind, MAX_PERKS, START_PTS, REVIVE_R, layout, resetMap, inside, zoneSpawn, initPlayer, wpn, upBits, has, use, tickBox, get BOX_SPOTS() { return BOX_SPOTS; }, get FORGE() { return FORGE; }, get POWER() { return POWER; } };
