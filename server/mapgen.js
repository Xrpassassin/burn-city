// Procedural zombie maps (Mortuus-style "you learn the game, not the map"): every free-play match gets a new
// layout on the same 40 x 32 grid the hand-built Refinery uses, so every other system (flow field, LOS, client
// renderer, minimap) works unchanged. Output is the same "def" shape as the classic map in cod.js.
const GW = 40, GH = 32;
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const THEMES = [
  { n: 'Control Room', st: 'desk', col: '#36c8ff' }, { n: 'Warehouse', st: 'crate', col: '#e0b070' }, { n: 'Lab', st: 'bench', col: '#5cff9a' },
  { n: 'Furnace Hall', st: 'furnace', col: '#ff4a1a' }, { n: 'Courtyard', st: 'tank', col: '#b47aff' }, { n: 'Cold Storage', st: 'crate', col: '#7ad8ff' },
  { n: 'Ash Archive', st: 'bench', col: '#ffd27a' }, { n: 'Slag Pit', st: 'furnace', col: '#ff6a3a' }, { n: 'Pump Station', st: 'tank', col: '#4affd8' },
  { n: 'Generator Room', st: 'pillar', col: '#ffe14a' }, { n: 'Chapel of Cinders', st: 'pillar', col: '#ff7ad0' }, { n: 'Loading Dock', st: 'crate', col: '#c8a0ff' }];
const MAPNAMES = ['Cinder Works', 'Ashfall Plant', 'Kiln Row', 'Ember Depot', 'Blackstack', 'Smelter 9', 'Soot Quarter', 'Pyre Yard', 'Charcoal Mill', 'Brimstone Annex'];
const FOOT = { desk: [4, 1, 1.1], crate: [2, 2, 2.2], bench: [6, 1, 1.1], furnace: [3, 3, 2.6], tank: [4, 4, 2.2], pillar: [1, 1, 3.2], pipe: [2, 1, 3.2] };

function gen(seed) {
  for (let k = 0; k < 40; k++) { const m = tryGen(rngOf(seed + k * 7919)); if (m) { m.seed = seed; return m; } }
  return null;   // caller falls back to the classic map
}
function tryGen(R) {
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)], shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const G = []; for (let r = 0; r < GH; r++) G.push(new Array(GW).fill(-1));
  // 1. rooms: a 3-row spine corridor with three rooms above and three below (split points, heights and corners all random)
  const rs = ri(12, 17), rooms = [];   // rooms[i] = {r:[c0,c1,r0,r1], band}
  const top = [1, rs - 2], bot = [rs + 4, GH - 2];
  for (const [band, [r0, r1]] of [['top', top], ['bot', bot]]) { const a = ri(10, 15), b = ri(24, 29), cols = [[1, a - 1], [a + 1, b - 1], [b + 1, GW - 2]];
    // sometimes a band has only two rooms (one long hall)
    const two = R() < 0.25; const list = two ? (R() < 0.5 ? [[1, a - 1], [a + 1, GW - 2]] : [[1, b - 1], [b + 1, GW - 2]]) : cols;
    for (const [c0, c1] of list) rooms.push({ r: [c0, c1, r0, r1], band }); }
  const spine = { r: [1, GW - 2, rs, rs + 2], band: 'spine' };
  // zone ids: 0 spawn (a room touching the spine), 1 spine corridor, then the rest in random order
  const order = shuffle(rooms.slice()), spawnRoom = order.shift(), zr = [spawnRoom, spine, ...order];
  const themes = shuffle(THEMES.slice());
  const ZONES = zr.map((z, i) => i === 0 ? { n: 'Spawn Bay', r: z.r, col: '#ff8a3a', st: 'pillar' } : i === 1 ? { n: pick(['Main Corridor', 'Service Tunnel', 'Conveyor Hall', 'Steam Gallery']), r: z.r, col: '#d8a060', st: 'pipe' } : { ...themes[i - 2], r: z.r });
  ZONES.forEach((z, i) => { const [c0, c1, r0, r1] = z.r; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) G[r][c] = i; });
  // 2. dead space: carve an outer corner off some rooms so they become L-shaped (never the spine or spawn)
  for (let i = 2; i < ZONES.length; i++) { if (R() > 0.45) continue; const [c0, c1, r0, r1] = ZONES[i].r, w = c1 - c0 + 1, h = r1 - r0 + 1; if (w < 9 || h < 9) continue;
    const cw = ri(3, Math.floor(w * 0.4)), ch = ri(3, Math.floor(h * 0.4)), left = R() < 0.5, outerTop = zr[i].band === 'top';
    const cc0 = left ? c0 : c1 - cw + 1, rr0 = outerTop ? r0 : r1 - ch + 1; for (let r = rr0; r < rr0 + ch; r++) for (let c = cc0; c < cc0 + cw; c++) G[r][c] = -1; }
  // 3. random mirror so the spine is not always the same way round
  const fx = R() < 0.5, fz = R() < 0.5; if (fx) for (const row of G) row.reverse(); if (fz) G.reverse();
  const mapC = c => fx ? GW - 1 - c : c, mapR = r => fz ? GH - 1 - r : r;
  for (const z of ZONES) { const [c0, c1, r0, r1] = z.r; z.r = [Math.min(mapC(c0), mapC(c1)), Math.max(mapC(c0), mapC(c1)), Math.min(mapR(r0), mapR(r1)), Math.max(mapR(r0), mapR(r1))]; }
  const NZ = ZONES.length, floor = (c, r) => r >= 0 && r < GH && c >= 0 && c < GW && G[r][c] >= 0 && G[r][c] < 100;
  // 4. doors: 2-cell gaps in single-thickness walls between two zones
  function doorSpots(a, b) { const out = [];
    for (let r = 1; r < GH - 1; r++) for (let c = 1; c < GW - 1; c++) { if (G[r][c] !== -1) continue;
      if (c + 1 < GW - 1 && G[r][c + 1] === -1) { const u = [G[r - 1][c], G[r - 1][c + 1]], d = [G[r + 1][c], G[r + 1][c + 1]];   // horizontal wall: zone above / below
        if ((u.every(v => v === a) && d.every(v => v === b)) || (u.every(v => v === b) && d.every(v => v === a))) out.push([[c, r], [c + 1, r]]); }
      if (r + 1 < GH - 1 && G[r + 1][c] === -1) { const l = [G[r][c - 1], G[r + 1][c - 1]], rr = [G[r][c + 1], G[r + 1][c + 1]];
        if ((l.every(v => v === a) && rr.every(v => v === b)) || (l.every(v => v === b) && rr.every(v => v === a))) out.push([[c, r], [c, r + 1]]); } }
    // keep away from the room's corners: drop the outermost candidates when there are plenty
    return out.length > 4 ? out.slice(1, -1) : out; }
  const DOORDEF = [], link = new Set(), addDoor = (a, b, cost) => { const s = doorSpots(a, b); if (!s.length) return false; const cells = pick(s); for (const [c, r] of cells) G[r][c] = 100 + DOORDEF.length; DOORDEF.push([a, b, cells, cost]); link.add(a + ':' + b); return true; };
  if (!addDoor(0, 1, 750)) return null;
  const adj = (a, b) => doorSpots(a, b).length > 0;
  const rest = shuffle([...Array(NZ).keys()].slice(2)), tierCost = [1000, 1000, 1250, 1250, 1500, 1500, 1750];
  rest.forEach((z, k) => { const viaSpine = R() < 0.72 || !rest.slice(0, k).concat([0]).some(o => adj(o, z));
    if (viaSpine) { if (!addDoor(1, z, tierCost[Math.min(k, 6)])) { const o = rest.slice(0, k).concat([0]).find(o => adj(o, z)); if (o == null || !addDoor(o, z, 1500)) return; } }
    else { const o = pick(rest.slice(0, k).concat([0]).filter(o => adj(o, z))); addDoor(o, z, k < 2 ? 1250 : 1500); } });
  for (let k = 0; k < 2; k++) { const a = pick(rest), b = pick(rest); if (a !== b && !link.has(a + ':' + b) && !link.has(b + ':' + a) && adj(a, b)) addDoor(a, b, 1500); }   // a couple of loops between rooms
  // every zone must be reachable through the door graph
  { const seen = new Set([0]); let grew = true; while (grew) { grew = false; for (const [a, b] of DOORDEF) { if (seen.has(a) !== seen.has(b)) { seen.add(a); seen.add(b); grew = true; } } } if (seen.size < NZ) return null; }
  const doorCells = DOORDEF.flatMap(d => d[2]), nearDoor = (c, r, k = 2) => doorCells.some(([dc, dr]) => Math.abs(dc - c) <= k && Math.abs(dr - r) <= k);
  // 5. windows: boarded gaps in the outer wall, 1-3 per zone, spaced apart, never at corners
  const WINDEF = [], winAt = (c, r) => WINDEF.some(w => Math.abs(w[0] - c) + Math.abs(w[1] - r) < 4);
  for (let z = 0; z < NZ; z++) { const cand = [];
    for (let c = 2; c < GW - 2; c++) { if (floor(c, 1) && G[1][c] === z && floor(c, 2) && G[2][c] === z) cand.push([c, 0, 0, -1]); if (G[GH - 2][c] === z && G[GH - 3][c] === z) cand.push([c, GH - 1, 0, 1]); }
    for (let r = 2; r < GH - 2; r++) { if (G[r][1] === z && G[r][2] === z) cand.push([0, r, -1, 0]); if (G[r][GW - 2] === z && G[r][GW - 3] === z) cand.push([GW - 1, r, 1, 0]); }
    const want = z === 1 ? 2 : z === 0 ? 2 : ri(1, 3); let got = 0;
    for (const w of shuffle(cand)) { if (got >= want) break; if (winAt(w[0], w[1]) || nearDoor(w[0], w[1], 1)) continue; WINDEF.push(w); got++; }
    if (z === 0 && !got) return null; }
  const winNear = (c, r, k) => WINDEF.some(w => Math.abs(w[0] - c) <= k && Math.abs(w[1] - r) <= k);
  // 6. obstacles per room theme; each placement must keep the room fully connected
  const OBST = [], solid = new Set();
  function connected(z) { const cells = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (G[r][c] === z) cells.push(r * GW + c); if (!cells.length) return false;
    const seen = new Set([cells[0]]), q = [cells[0]]; for (let h = 0; h < q.length; h++) { const i = q[h], c = i % GW, r = (i - c) / GW; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, j = nr * GW + nc; if (!seen.has(j) && G[nr]?.[nc] === z) { seen.add(j); q.push(j); } } }
    return seen.size === cells.length; }
  function place(z, st, c0, r0, w, h, ht) { for (let r = r0 - 1; r <= r0 + h; r++) for (let c = c0 - 1; c <= c0 + w; c++) { if (r === r0 - 1 || r === r0 + h || c === c0 - 1 || c === c0 + w) { if (st !== 'pipe' && G[r]?.[c] !== z) return false; } else if (G[r]?.[c] !== z) return false; }   // 1-cell clearance inside the room
    if (st !== 'pipe') for (let r = r0 - 1; r <= r0 + h; r++) for (let c = c0 - 1; c <= c0 + w; c++) if (solid.has(r * GW + c)) return false;
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (nearDoor(c, r, 2) || winNear(c, r, 2)) return false;
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) G[r][c] = -1;
    if (!connected(z)) { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) G[r][c] = z; return false; }
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) solid.add(r * GW + c); OBST.push([c0, c0 + w - 1, r0, r0 + h - 1, ht, st]); return true; }
  for (let z = 0; z < NZ; z++) { const Z = ZONES[z], [c0, c1, r0, r1] = Z.r, area = (c1 - c0 + 1) * (r1 - r0 + 1);
    if (z === 1) { for (let k = 0, n = 0; k < 30 && n < 3; k++) { const c = ri(c0 + 2, c1 - 3), r = R() < 0.5 ? r0 : r1; if (place(z, 'pipe', c, r, 2, 1, 3.2)) n++; } continue; }
    let [w, h, ht] = FOOT[Z.st] || FOOT.pillar; const vertical = R() < 0.5 && Z.st !== 'tank'; if (vertical) [w, h] = [h, w];
    const target = Z.st === 'tank' ? ri(1, 2) : Z.st === 'pillar' ? ri(3, 6) : Math.max(2, Math.min(7, Math.round(area / (w * h * 9)) + ri(-1, 1)));
    for (let k = 0, n = 0; k < 120 && n < target; k++) if (place(z, Z.st, ri(c0 + 1, c1 - w), ri(r0 + 1, r1 - h), w, h, ht)) n++; }
  // 7. props against walls: wall-buys, mystery-box spots, perks, the Inferno Forge and the power switch
  const used = [], wallOf = (c, r) => G[r]?.[c] === -1 && !solid.has(r * GW + c) && !WINDEF.some(w => w[0] === c && w[1] === r);
  function spot(z, avoid = 3) { const cand = [];
    for (let r = 1; r < GH - 1; r++) for (let c = 1; c < GW - 1; c++) { if (G[r][c] !== z || nearDoor(c, r, 2) || winNear(c, r, 2) || used.some(([uc, ur]) => Math.abs(uc - c) + Math.abs(ur - r) < avoid)) continue;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (wallOf(c + dc, r + dr) && G[r - dr]?.[c - dc] === z && !solid.has((r - dr) * GW + c - dc)) cand.push([c, r, dc, dr]); }
    if (!cand.length) return null; const s = pick(cand); used.push(s); return s; }
  const others = [...Array(NZ).keys()].slice(2), deepest = DOORDEF.reduce((m, d) => d[3] > m[1] ? [d[1], d[3]] : m, [others[0], 0])[0];
  const s1 = spot(0), s2 = spot(1), s3 = spot(pick(others)); if (!s1 || !s2 || !s3) return null;
  const WALLBUYS = [{ w: 'shotgun', cost: 500, s: s1 }, { w: 'dragon', cost: 1000, s: s2 }, { w: 'napalm', cost: 1500, s: s3 }];
  const boxZ = [1, ...shuffle(others.slice()), 0].slice(0, 6), BOX = boxZ.map(z => spot(z, 4)).filter(Boolean); if (BOX.length < 3) return null;
  const forge = spot(deepest, 4); if (!forge) return null;
  const powerZ = pick(others.filter(z => z !== deepest).length ? others.filter(z => z !== deepest) : others), power = spot(powerZ, 4); if (!power) return null;
  const perkZ = { revive: 0, quick: pick([0, 1]), jug: pick(others), speed: pick([1, ...others]), dbl: pick(others), slag: pick(others), burn: pick(others), valve: pick([1, ...others]), leech: pick([0, 1, ...others]) }, PERKSPOT = {};
  for (const k of Object.keys(perkZ)) { PERKSPOT[k] = spot(perkZ[k], 4) || spot(1, 4) || spot(pick(others), 3) || spot(1, 3); if (!PERKSPOT[k]) return null; }
  // Night Shift radio quest: a console against a wall somewhere off the spine, plus the rooms each step's item hides in (any room but spawn)
  const qc = spot(pick(others), 4) || spot(1, 3); if (!qc) return null; const qz = shuffle(others.slice());
  const quest = { console: qc, zones: [[qz[0]], [qz[1 % qz.length]], [qz[2 % qz.length]]] };
  // 8. sanity: with every door open, all floor is reachable from spawn
  { let start = -1, total = 0; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (G[r][c] >= 0) { total++; if (start < 0 && G[r][c] === 0) start = r * GW + c; }
    const seen = new Set([start]), q = [start]; for (let h = 0; h < q.length; h++) { const i = q[h], c = i % GW, r = (i - c) / GW; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, j = nr * GW + nc; if (!seen.has(j) && G[nr]?.[nc] >= 0) { seen.add(j); q.push(j); } } }
    if (seen.size !== total) return null; }
  const tod = pick(['day', 'dusk', 'night', 'night']), env = { tod, storm: R() < 0.3 };
  return { name: pick(MAPNAMES), env, grid: G, zones: ZONES.map(({ n, r, col }) => ({ n, r, col })), obst: OBST, doordef: DOORDEF, windef: WINDEF, wallbuys: WALLBUYS, box: BOX, forge, power, perks: PERKSPOT, quest };
}
module.exports = { gen, GW, GH };
