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
const PERKINFO = { jug: { name: 'Ember Armor', desc: '250 max health', cost: 2500, col: '#ff3030', ic: '🛡️' }, quick: { name: 'Quick Fuel', desc: 'Faster fuel refill and reload', cost: 2000, col: '#30c0ff', ic: '⛽' },
  speed: { name: 'Fire Walk', desc: 'Faster movement', cost: 2000, col: '#30ff70', ic: '👟' }, revive: { name: 'Phoenix Revive', desc: 'Revive teammates fast · solo: revive yourself once', cost: 1500, col: '#ffd030', ic: '🪶' },
  dbl: { name: 'Double Burn', desc: 'Double damage', cost: 3000, col: '#c040ff', ic: '💥' },
  // 2026-10 additions (appended so the perk bit of every older perk stays the same)
  slag: { name: 'Slag Skin', desc: 'Zombies that hit you get a face full of molten slag', cost: 2000, col: '#ff8a1a', ic: '🌋' },
  burn: { name: 'Afterburn', desc: 'Your hits set zombies alight: +35% damage as burn', cost: 2500, col: '#ff4a6a', ic: '🔥' },
  valve: { name: 'Pressure Valve', desc: 'Below 35% health you vent a fire nova (30 s recharge)', cost: 2000, col: '#ffe14a', ic: '♨️' },
  leech: { name: 'Cinder Leech', desc: 'Every kill heals 8 health', cost: 1500, col: '#8aff5a', ic: '🩸' } };
const PERK_KEYS = ['jug', 'quick', 'speed', 'revive', 'dbl', 'slag', 'burn', 'valve', 'leech'];
// ===== The BURN Refinery: the hand-built classic map (ranked + daily keep it so everyone plays the same layout) =====
// cell codes: -1 wall/obstacle, 0..n floor of that room, 100+d door d (walkable once open)
const CLASSIC = { name: 'The BURN Refinery', env: null,
  zones: [{ n: 'Spawn Bay', r: [16, 23, 21, 30], col: '#ff8a3a' }, { n: 'Main Corridor', r: [1, 38, 17, 19], col: '#d8a060' },
    { n: 'Control Room', r: [1, 14, 21, 30], col: '#36c8ff' }, { n: 'Warehouse', r: [25, 38, 21, 30], col: '#e0b070' },
    { n: 'Lab', r: [1, 12, 1, 15], col: '#5cff9a' }, { n: 'Furnace Hall', r: [27, 38, 1, 15], col: '#ff4a1a' }, { n: 'Courtyard', r: [14, 25, 1, 15], col: '#b47aff' },
    { n: 'The Gantry', r: [25, 38, 21, 30], col: '#ffc23a', lv: 1 },
    { n: 'Rooftop Helipad', r: [16, 23, 21, 30], col: '#7aff6a', lv: 1 }],   // zone 8: roof over Spawn Bay, reached through a gate in the Gantry's west wall (helicopter finale)   // upper level over the Warehouse (lv 1 zones never fill the ground grid)
  obst: [[18, 18, 24, 24, 3.2, 'pillar'], [21, 21, 24, 24, 3.2, 'pillar'], [18, 18, 27, 27, 3.2, 'pillar'], [21, 21, 27, 27, 3.2, 'pillar'],
    [3, 6, 23, 23, 1.1, 'desk'], [9, 12, 23, 23, 1.1, 'desk'], [3, 6, 27, 27, 1.1, 'desk'], [9, 12, 27, 27, 1.1, 'desk'],
    [27, 28, 23, 24, 2.2, 'crate'], [31, 32, 23, 24, 2.2, 'crate'], [35, 36, 23, 24, 2.2, 'crate'], [27, 28, 27, 28, 2.2, 'crate'], [31, 32, 27, 28, 2.2, 'crate'], [35, 36, 27, 28, 2.2, 'crate'],
    [3, 10, 4, 4, 1.1, 'bench'], [3, 10, 8, 8, 1.1, 'bench'], [3, 10, 12, 12, 1.1, 'bench'],
    [29, 31, 4, 6, 2.6, 'furnace'], [34, 36, 4, 6, 2.6, 'furnace'], [29, 31, 10, 12, 2.6, 'furnace'], [34, 36, 10, 12, 2.6, 'furnace'],
    [18, 21, 6, 9, 2.2, 'tank'], [8, 9, 17, 17, 3.2, 'pipe'], [29, 30, 19, 19, 3.2, 'pipe'],
    // Gantry: solid stair towers under each ramp landing, low guard rails along the open side of each ramp
    [29, 30, 21, 22, 3.6, 'support'], [33, 34, 29, 30, 3.6, 'support'], [28, 28, 25, 26, 1.1, 'rail'], [31, 32, 25, 26, 1.1, 'rail'], [35, 35, 25, 26, 1.1, 'rail']],
  doordef: [[0, 1, [[19, 20], [20, 20]], 750], [1, 2, [[7, 20], [8, 20]], 1000], [1, 3, [[31, 20], [32, 20]], 1000], [1, 4, [[6, 16], [7, 16]], 1250],
    [1, 5, [[32, 16], [33, 16]], 1250], [4, 6, [[13, 7], [13, 8]], 1500], [5, 6, [[26, 7], [26, 8]], 1500],
    [3, 7, [[29, 27], [30, 27]], 1250, 'debris'], [3, 7, [[33, 24], [34, 24]], 1250, 'debris'],
    [7, 8, [[24, 25], [24, 26]], 2000, 0, 1]],   // 6th value 1 = door sits on the upper grid (Gantry -> Rooftop Helipad gate)   // rubble at the foot of both Gantry ramps (clearing either opens the Gantry)
  // boarded windows in exterior walls: wall cell + outward direction
  windef: [[18, 31, 0, 1], [21, 31, 0, 1], [0, 24, -1, 0], [0, 28, -1, 0], [6, 31, 0, 1], [39, 24, 1, 0], [39, 28, 1, 0], [32, 31, 0, 1],
    [0, 5, -1, 0], [0, 11, -1, 0], [6, 0, 0, -1], [17, 0, 0, -1], [22, 0, 0, -1], [39, 5, 1, 0], [39, 11, 1, 0], [32, 0, 0, -1], [0, 18, -1, 0], [39, 18, 1, 0],
    [39, 22, 1, 0, 1], [39, 27, 1, 0, 1], [27, 31, 0, 1, 1], [36, 31, 0, 1, 1],
    [15, 23, -1, 0, 1], [15, 28, -1, 0, 1], [19, 31, 0, 1, 1], [20, 20, 0, -1, 1]],   // helipad roof vents   // 5th value 1 = upper-level vent (zombies crawl in off the outside ledges)
  wallbuys: [{ w: 'shotgun', cost: 500, s: [16, 25, -1, 0] }, { w: 'dragon', cost: 1000, s: [14, 17, 0, -1] }, { w: 'napalm', cost: 1500, s: [38, 25, 1, 0] }],
  box: [[4, 19, 0, 1], [13, 29, 1, 0], [37, 22, 0, -1], [2, 2, -1, 0], [37, 14, 1, 0], [15, 14, -1, 0]],
  forge: [32, 1, 0, -1], power: null,
  perks: { jug: [1, 30, -1, 0], quick: [25, 30, -1, 0], speed: [38, 17, 1, 0], revive: [23, 30, 1, 0], dbl: [25, 1, 1, 0], slag: [14, 4, -1, 0], burn: [38, 8, 1, 0], valve: [26, 21, 0, -1, 1], leech: [12, 3, 1, 0] },
  quest: { console: [14, 22, 1, 0], zones: [[4, 6], [5], [7], [2, 1], [5, 6]], beacon: [19, 23, 0, 1, 1], pad: [19.5, 26.5], padZone: 8 },   // ch.4: battery + flare go to the pad beacon   // Night Shift radio quest: the flare console + which rooms hold each step's item
  // upper level: walkable rects (catwalk ring), outer walls, open void over the Warehouse floor, and two 4-cell ramps (up = the direction you climb)
  upper: { zone: 7, h: 3.6, atrium: [25, 38, 21, 30], walk: [[25, 38, 21, 22], [25, 38, 29, 30], [25, 26, 23, 28], [37, 38, 23, 28]], walls: [[24, 39, 20, 20], [24, 39, 31, 31], [24, 24, 20, 31], [39, 39, 20, 31]], void: [[27, 36, 23, 28]],
    ramps: [{ c: [29, 30], r: [23, 26], up: 'n' }, { c: [33, 34], r: [25, 28], up: 's' }],
    extra: [{ zone: 8, walk: [[16, 23, 21, 30]], walls: [[15, 24, 20, 20], [15, 24, 31, 31], [15, 15, 20, 31]] }] } };
// ===== The Ashen Cosmodrome: fixed, handcrafted space-launch zombie map =====
const COSMODROME = { name: 'The Ashen Cosmodrome', kind: 'cosmodrome', env: { tod: 'night', storm: true },
  zones: [
    { n: 'Service Yard', r: [15, 24, 24, 30], col: '#d6a36b' },
    { n: 'Access Spine', r: [15, 26, 18, 23], col: '#d6a36b' },
    { n: 'Barracks & Motor Pool', r: [3, 14, 18, 30], col: '#8e9aa6' },
    { n: 'Containment Laboratory', r: [3, 14, 3, 17], col: '#62c7c8' },
    { n: 'Launch Control', r: [15, 26, 3, 17], col: '#d7bd79' },
    { n: 'Fuel & Turbine Hall', r: [27, 38, 3, 17], col: '#e47b48' },
    { n: 'Launch Gantry', r: [27, 38, 18, 30], col: '#d6a36b' }
  ],
  obst: [
    [17, 18, 26, 27, 1.5, 'crate'], [21, 22, 27, 28, 1.5, 'crate'],
    [5, 6, 22, 23, 1.1, 'desk'], [10, 11, 25, 26, 1.1, 'desk'],
    [5, 6, 5, 6, 2.2, 'tank'], [9, 10, 11, 12, 2.2, 'tank'], [6, 8, 14, 14, 2.8, 'pipe'],
    [17, 18, 5, 6, 1.1, 'desk'], [22, 23, 12, 13, 1.1, 'desk'],
    [29, 30, 5, 6, 2.6, 'furnace'], [35, 36, 5, 6, 2.6, 'furnace'],
    [29, 30, 11, 12, 2.6, 'furnace'], [35, 36, 11, 12, 2.6, 'furnace'],
    [29, 30, 21, 22, 3.6, 'support'], [36, 37, 21, 22, 3.6, 'support'],
    [29, 30, 27, 28, 3.6, 'support'], [36, 37, 27, 28, 3.6, 'support'],
    [32, 33, 22, 22, 1.1, 'rail'], [32, 33, 29, 29, 1.1, 'rail']
  ],
  doordef: [
    [0, 1, [[19, 23], [20, 23]], 500],
    [1, 2, [[14, 20], [14, 21]], 750],
    [2, 3, [[8, 17], [9, 17]], 1000],
    [3, 4, [[14, 8], [14, 9]], 1000],
    [4, 5, [[26, 8], [26, 9]], 1250],
    [1, 6, [[25, 20], [26, 20]], 1500],
    [5, 6, [[32, 18], [33, 18]], 1250]
  ],
  // Wall cells plus outward direction; zombie entry points remain authored and repeatable.
  windef: [
    [18, 31, 0, 1], [21, 31, 0, 1],
    [2, 23, -1, 0], [2, 28, -1, 0],
    [6, 2, 0, -1], [10, 2, 0, -1],
    [39, 5, 1, 0], [39, 12, 1, 0],
    [32, 31, 0, 1], [36, 31, 0, 1]
  ],
  wallbuys: [
    { w: 'shotgun', cost: 500, s: [16, 25, -1, 0] },
    { w: 'dragon', cost: 1000, s: [14, 22, 0, -1] },
    { w: 'napalm', cost: 1500, s: [38, 25, 1, 0] }
  ],
  box: [[19, 28, 0, 1], [7, 25, -1, 0], [20, 5, 0, -1], [35, 25, 1, 0], [8, 7, -1, 0], [30, 12, 1, 0]],
  forge: [35, 5, 0, -1], power: [23, 8, 1, 0],
  perks: {
    jug: [4, 29, -1, 0], quick: [25, 16, 0, -1], speed: [37, 28, 1, 0],
    revive: [18, 26, 0, 1], dbl: [37, 4, 1, 0], slag: [4, 10, -1, 0],
    burn: [30, 15, 1, 0], valve: [24, 22, 0, -1], leech: [17, 5, -1, 0]
  },
  quest: null
};
const COSMODROME_M = build(COSMODROME, 'cosmodrome');
if (process.env.ZOMBIE_TEST_PROPS && !process.env.FLY_APP_NAME) { CLASSIC.box.push([17, 22, 1, 0]); CLASSIC.forge = [22, 22, 1, 0]; }   // local screenshot runs only
const FORGE_COST = +process.env.ZOMBIE_FORGE_COST || 5000;
function build(def, kind) {
  const GRID = def.grid ? def.grid.map(r => r.slice()) : (() => { const G = []; for (let r = 0; r < GH; r++) G.push(new Array(GW).fill(-1));
    def.zones.forEach((z, i) => { if (z.lv) return; for (let r = z.r[2]; r <= z.r[3]; r++) for (let c = z.r[0]; c <= z.r[1]; c++) G[r][c] = i; });
    for (const rp of def.upper?.ramps || []) for (let r = rp.r[0]; r <= rp.r[1]; r++) for (let c = rp.c[0]; c <= rp.c[1]; c++) G[r][c] = def.upper.zone;   // ramp cells belong to the upper zone on both levels
    for (const [c0, c1, r0, r1] of def.obst) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) G[r][c] = -1; return G; })();
  // ---- upper level (optional): a second grid on the same cells. -1 wall, -2 open void (see-through), -3 nothing, zone id = walkable
  const U = def.upper, UH = U ? U.h : 0, UPG = U ? GRID.map(row => row.map(() => -3)) : null, RAMPAT = {};
  if (U) { const fill = (rects, v) => { for (const [c0, c1, r0, r1] of rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) UPG[r][c] = v; };
    fill(U.walls, -1); for (const e of U.extra || []) fill(e.walls, -1); fill(U.void, -2); fill(U.walk, U.zone); for (const e of U.extra || []) fill(e.walk, e.zone);
    U.ramps.forEach((rp, i) => { for (let r = rp.r[0]; r <= rp.r[1]; r++) for (let c = rp.c[0]; c <= rp.c[1]; c++) { UPG[r][c] = U.zone; RAMPAT[r * GW + c] = i; } }); }
  const DOORS = def.doordef.map(([a, b, cells, cost, kind, lv], d) => { for (const [c, r] of cells) ((lv && UPG) || GRID)[r][c] = 100 + d;
    const x = cells.reduce((s, [c]) => s + WX(c), 0) / cells.length, z = cells.reduce((s, [, r]) => s + WZ(r), 0) / cells.length;
    return { a, b, cells, cost, x, z, ax: cells[0][1] === cells[1][1] ? 'x' : 'z', ...(kind === 'debris' ? { deb: 1 } : {}), ...(lv ? { lv: 1 } : {}) }; });
  const RAMPS = U ? U.ramps.map(rp => { const n = rp.up === 'n' || rp.up === 's', z0 = WZ(rp.r[0]) - 1, z1 = WZ(rp.r[1]) + 1, x0 = WX(rp.c[0]) - 1, x1 = WX(rp.c[1]) + 1;
    return { ...rp, x0, x1, z0, z1, ax: n ? 'z' : 'x', lo: rp.up === 'n' ? z1 : rp.up === 's' ? z0 : rp.up === 'w' ? x1 : x0, hi: rp.up === 'n' ? z0 : rp.up === 's' ? z1 : rp.up === 'w' ? x0 : x1 }; }) : [];
  const WINDOWS = def.windef.map(([c, r, nx, nz, lv = 0]) => { const x = WX(c), z = WZ(r); return { zone: (lv ? UPG : GRID)[r - nz][c - nx], c, r, x, z, ox: x + nx * 1.6, oz: z + nz * 1.6, ix: x - nx * 2.2, iz: z - nz * 2.2, ax: nz ? 'x' : 'z', ...(lv ? { lv: 1 } : {}) }; });
  // line of sight for flames: tall walls and closed doors block, low desks/benches and boarded windows don't
  const SEE = GRID.map(row => row.map(() => 0)); for (const [c0, c1, r0, r1, h] of def.obst) if (h < 1.5) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) SEE[r][c] = 1;
  for (const w of def.windef) if (!w[4]) SEE[w[1]][w[0]] = 1;
  const UPSEE = U ? UPG.map(row => row.map(v => v === -2 ? 1 : 0)) : null; if (U) for (const w of def.windef) if (w[4]) UPSEE[w[1]][w[0]] = 1;
  const P = s => ({ ...at(...s), ...(s[4] ? { lv: 1 } : {}) });
  return { kind, name: def.name, env: def.env, seed: def.seed, GRID, SEE, DOORS, WINDOWS, ZONES: def.zones, OBST: def.obst, UPG, UPSEE, UH, RAMPAT, RAMPS, ATR: U ? U.atrium : null, UZ: U ? U.zone : -1, UXZ: U ? (U.extra || []).map(e => e.zone) : [], QDEF: def.quest || null,
    WALLBUYS: def.wallbuys.map(w => ({ w: w.w, cost: w.cost, ...P(w.s) })), BOX_SPOTS: def.box.map(s => { const p = P(s); return [p.x, p.z, p.face]; }),
    FORGE: { ...P(def.forge), cost: FORGE_COST, name: 'Inferno Forge' }, POWER: def.power ? { ...P(def.power), name: 'Power Switch' } : null,
    PERKS: PERK_KEYS.map(k => ({ k, ...PERKINFO[k], ...P(def.perks[k]) })) };
}
const CLASSIC_M = build(CLASSIC, 'classic');
let M, GRID, SEE, DOORS, WINDOWS, ZONES, OBST, WALLBUYS, BOX_SPOTS, FORGE, POWER, PERKS, UPG, UPSEE, UH, RAMPAT, RAMPS, ATR;
function use_(m) { M = m; ({ GRID, SEE, DOORS, WINDOWS, ZONES, OBST, WALLBUYS, BOX_SPOTS, FORGE, POWER, PERKS, UPG, UPSEE, UH, RAMPAT, RAMPS, ATR } = m); }
use_(CLASSIC_M);
// ranked + daily rooms always play the classic Refinery (same layout for everyone on a leaderboard); free play gets a new map per match
const wantsClassic = room => !!(room.ranked || room.daily || process.env.ZOMBIE_CLASSIC === '1');
function newMap(room) { if (wantsClassic(room)) return CLASSIC_M; if (room.mapId === 'cosmodrome' || (process.env.ZOMBIE_MAP === 'cosmodrome' && !process.env.FLY_APP_NAME)) return COSMODROME_M; const d = MapGen.gen(room.seedT != null && !process.env.FLY_APP_NAME ? room.seedT : (Math.random() * 2 ** 31) | 0); return d ? build(d, 'proc') : CLASSIC_M; }
// every entry point that touches the map binds the room's own layout first (rooms run one at a time, so a module-level binding is safe)
function bind(room) { if (!room) return use_(CLASSIC_M); if (!room.M || (wantsClassic(room) && room.M.kind !== 'classic')) { resetMap(room); return; } if (M !== room.M) use_(room.M); }
// lv = which floor (0 ground, 1 upper). Maps without an upper level ignore it, so procedural maps behave exactly as before.
const gridOf = lv => (lv && UPG) ? UPG : GRID;
const cellAt = (x, z, lv = 0) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); return r < 0 || r >= GH || c < 0 || c >= GW ? -1 : gridOf(lv)[r][c]; };
const doorOpen = (room, d) => unlocked(room, DOORS[d].a) && unlocked(room, DOORS[d].b);
const walkCode = (room, v) => v >= 100 ? doorOpen(room, v - 100) : v >= 0 && unlocked(room, v);
const walk = (room, x, z, lv = 0) => walkCode(room, cellAt(x, z, lv));
const lvOf = y => (UPG && y > UH * 0.5 ? 1 : 0);
// height + floor of something standing at (x,z): on a ramp the height follows the slope and the floor flips at its midpoint
function lift(e) { if (!UPG) { e.lv = 0; e.y = 0; return; } const c = Math.floor(e.x / CELL + GW / 2), r = Math.floor(e.z / CELL + GH / 2), ri = r >= 0 && r < GH && c >= 0 && c < GW ? RAMPAT[r * GW + c] : undefined;
  if (ri === undefined) { e.lv = e.lv ? 1 : 0; e.y = e.lv * UH; return; } const rp = RAMPS[ri], v = rp.ax === 'z' ? e.z : e.x, t = Math.max(0, Math.min(1, (v - rp.lo) / (rp.hi - rp.lo))); e.y = t * UH; e.lv = t > 0.5 ? 1 : 0; }
const onRamp = (x, z) => { if (!UPG) return false; const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); return r >= 0 && r < GH && c >= 0 && c < GW && RAMPAT[r * GW + c] !== undefined; };
// line of sight for flames: tall walls and closed doors block, low desks/benches and boarded windows don't.
// Across floors: only inside the Gantry's open atrium, and only to a spot not roofed over by the catwalk (or on a ramp).
function los(room, x0, z0, x1, z1, y0 = 0, y1 = y0) { const l0 = lvOf(y0), l1 = lvOf(y1);
  if (l0 !== l1) { const inA = (x, z) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); return c >= ATR[0] && c <= ATR[1] && r >= ATR[2] && r <= ATR[3]; };
    if (!inA(x0, z0) || !inA(x1, z1)) return false; const [lx, lz] = l0 ? [x1, z1] : [x0, z0]; if (onRamp(lx, lz)) return true; const v = cellAt(lx, lz, 1); return v === -2; }
  const G = gridOf(l0), S = l0 ? UPSEE : SEE, d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.7);
  for (let k = 1; k < n; k++) { const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n, c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2);
    if (r < 0 || r >= GH || c < 0 || c >= GW) continue; const v = G[r][c]; if (v >= 100 ? !doorOpen(room, v - 100) : v < 0 && !S[r][c] && !(l0 && RAMPAT[r * GW + c] !== undefined)) return false; } return true; }
// flow field: BFS distance (in cells) from every standing player, over walkable cells; zombies descend it.
// With an upper level the field has two layers; a ramp cell is one shared node (same distance on both layers), which is how zombies follow you up and down.
function flow(room, ps) { const NL = UPG ? 2 : 1, N = GW * GH, D = room.flowD && room.flowD.length === N * NL ? room.flowD : (room.flowD = new Float32Array(N * NL)); D.fill(1e9); const q = [];
  const seed = (i, l, v) => { D[l * N + i] = v; q.push(l * N + i); if (NL > 1 && RAMPAT[i] !== undefined && D[(1 - l) * N + i] > v) { D[(1 - l) * N + i] = v; q.push((1 - l) * N + i); } };
  for (const p of ps) { const c = Math.floor(p.x / CELL + GW / 2), r = Math.floor(p.z / CELL + GH / 2), l = NL > 1 ? (p.lv || 0) : 0; if (r >= 0 && r < GH && c >= 0 && c < GW && D[l * N + r * GW + c] > 0) seed(r * GW + c, l, 0); }
  for (let h = 0; h < q.length; h++) { const k = q[h], l = k >= N ? 1 : 0, i = k - l * N, c = i % GW, r = (i - c) / GW, G = l ? UPG : GRID;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= GW || nr >= GH) continue; const j = nr * GW + nc;
      if (D[l * N + j] <= D[k] + 1 || !walkCode(room, G[nr][nc])) continue; seed(j, l, D[k] + 1); } } }
// next waypoint for a zombie at (x,z) on floor lv: centre of the best neighbour cell (diagonals only when both sides are open)
function nextStep(room, x, z, lv = 0) { const D = room.flowD; if (!D) return null; const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); if (r < 0 || r >= GH || c < 0 || c >= GW) return null;
  const l = UPG && lv ? 1 : 0, o = l * GW * GH, G = l ? UPG : GRID;
  let best = D[o + r * GW + c], bc = -1, br = -1; const ok = (cc, rr) => cc >= 0 && rr >= 0 && cc < GW && rr < GH && walkCode(room, G[rr][cc]);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dc && !dr) continue; const nc = c + dc, nr = r + dr; if (!ok(nc, nr)) continue; if (dc && dr && !(ok(c + dc, r) && ok(c, r + dr))) continue;
    const v = D[o + nr * GW + nc] + (dc && dr ? 0.4 : 0); if (v < best) { best = v; bc = nc; br = nr; } }
  return bc < 0 ? null : [WX(bc), WZ(br), D[o + r * GW + c]]; }
const BOX_COST = 950, BOX_POOL = ['dragon', 'shotgun', 'napalm', 'beam'];
const BOARDS = 6, BOARD_PTS = 10, REPAIR_CAP = 500, REPAIR_T = 0.75, TEAR_T = 1.1;
const MAX_PERKS = 4, START_PTS = +process.env.ZOMBIE_START_POINTS || 500,   // env override is for local testing only
  USE_R = 3, REVIVE_R = 2.6;
const PB = Object.fromEntries(PERKS.map((p, i) => [p.k, 1 << i]));
const layout = () => ({ up: UPG ? { grid: UPG, h: UH, ramps: RAMPS, atrium: ATR, zone: M.UZ, zones: [M.UZ, ...(M.UXZ || [])] } : null, quest: M.QDEF ? 1 : 0, grid: GRID, cell: CELL, gw: GW, gh: GH, obst: OBST, windows: WINDOWS, boards: BOARDS, repairCap: REPAIR_CAP, zones: ZONES, doors: DOORS, wallbuys: WALLBUYS, box: BOX_SPOTS, boxCost: BOX_COST, forge: FORGE, power: POWER, name: M.name, env: M.env, kind: M.kind, perks: PERKS, weapons: WEAPONS.map(w => ({ id: w.id, name: w.name, kind: w.kind, up: UPW[w.id].name })), maxPerks: MAX_PERKS });

const WIN_MAX = 2, WIN_GAP = 1.3, RUNNER = 1.4;   // runner speed mult (was 1.7)
const scaleN = n => n <= 1 ? 0.75 : Math.min(1.9, 0.7 + 0.3 * n), hpN = n => n <= 1 ? 0.85 : Math.min(1.5, 0.8 + 0.12 * n), waveGap = n => n <= 1 ? 12 : Math.max(8, 12 - (n - 1));
function resetMap(room) { room.M = newMap(room); use_(room.M); room.power = POWER ? 0 : 1; room.flowD = null; room.boards = WINDOWS.map(() => BOARDS); room.winLast = WINDOWS.map(() => -99); room.zt = 0; room.open = 1; room.box = { spot: process.env.ZOMBIE_TEST_BOX ? Math.min(+process.env.ZOMBIE_TEST_BOX, BOX_SPOTS.length - 1) : 0, state: 0, t: 0, uses: 0, moveAfter: 4 + Math.floor(Math.random() * 4) }; room.proj = []; room.pools = [];
  if (process.env.ZOMBIE_TEST_OPEN && !process.env.FLY_APP_NAME) room.open = +process.env.ZOMBIE_TEST_OPEN;   // local test runs only: start with these zones unlocked (bitmask)
  require('./quest').init(room); }
const unlocked = (room, z) => (room.open >> z) & 1;
const inside = (room, x, z, m = 0.42, lv = 0) => walk(room, x + m, z + m, lv) && walk(room, x - m, z + m, lv) && walk(room, x + m, z - m, lv) && walk(room, x - m, z - m, lv);   // body-radius collision vs walls / closed doors
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
  const py = p.y || 0, near = (x, z, r = USE_R, lv = 0) => Math.hypot(p.x - x, p.z - z) <= r && Math.abs(py - lv * (UH || 0)) < 1.6;
  if (WINDOWS.some((w, i) => winOn(room, i) && room.boards[i] < BOARDS && Math.hypot(p.x - w.ix, p.z - w.iz) < 2.6 && Math.abs(py - (w.lv || 0) * (UH || 0)) < 1.6)) return;   // near a broken window F does nothing (rebuild is automatic), never a purchase
  for (let i = 0; i < DOORS.length; i++) { const d = DOORS[i], ua = unlocked(room, d.a), ub = unlocked(room, d.b); if (ua === ub || !near(d.x, d.z, 22, d.lv || 0)) continue;
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
  for (const k of PERKS) if (near(k.x, k.z, USE_R, k.lv || 0)) { if (has(p, k.k)) return; if (!room.power) return ev.push({ e: 'nopower', id: p.id }); let n = 0; for (let v = p.perks; v; v >>= 1) n += v & 1; if (n >= MAX_PERKS) return ev.push({ e: 'perkmax', id: p.id });
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
  let best = -1, bd = 2.6; WINDOWS.forEach((w, i) => { const d = Math.hypot(p.x - w.ix, p.z - w.iz); if (d < bd && room.boards[i] < BOARDS && winOn(room, i) && Math.abs((p.y || 0) - (w.lv || 0) * (UH || 0)) < 1.6) { bd = d; best = i; } });
  if (best < 0) { p.repT = 0; return; } if ((p.repT = (p.repT || 0) + dt) < REPAIR_T) return; p.repT = 0;
  room.boards[best]++; if (p.repWave !== room.wave) { p.repWave = room.wave; p.repPts = 0; } const pts = Math.min(BOARD_PTS, REPAIR_CAP - p.repPts); p.pts += pts; p.repPts += pts;
  ev.push({ e: 'board', i: best, n: room.boards[best], by: p.id, pts }); }
module.exports = { winOn, lift, lvOf, onRamp, get UH() { return UH || 0; }, get UPG() { return UPG; }, get QDEF() { return M.QDEF; }, get M() { return M; }, GW, GH, WX, WZ, unlocked, PERKINFO, RUNNER, scaleN, hpN, waveGap, los, flow, nextStep, walk, cellAt, CELL, get WINDOWS() { return WINDOWS; }, windowSpawn, atWindow, repair, WEAPONS, WI, get ZONES() { return ZONES; }, get DOORS() { return DOORS; }, get PERKS() { return PERKS; }, PB, bind, MAX_PERKS, START_PTS, REVIVE_R, layout, resetMap, inside, zoneSpawn, initPlayer, wpn, upBits, has, use, tickBox, get BOX_SPOTS() { return BOX_SPOTS; }, get FORGE() { return FORGE; }, get POWER() { return POWER; } };
