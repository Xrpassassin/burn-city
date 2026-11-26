// Fixed-map integration smoke test for The Ashen Cosmodrome.
// Exercises the real server map builder and flow-field navigation; no server process or network required.
const assert = require('node:assert/strict');
delete process.env.ZOMBIE_CLASSIC;
delete process.env.ZOMBIE_MAP;
delete process.env.FLY_APP_NAME;

const Z = require('../server/cod');
const room = { ranked: false, daily: null, mapId: 'cosmodrome', zombies: new Map(), players: new Map() };
Z.resetMap(room);
Z.bind(room);

const L = Z.layout();
assert.equal(L.kind, 'cosmodrome', 'explicit map choice selects the fixed Cosmodrome');
assert.equal(L.name, 'The Ashen Cosmodrome');
assert.ok(L.gw >= 64 && L.gh >= 48, 'the rebuilt Cosmodrome is several times larger than the 40x32 Refinery');
assert.equal(L.gw, Z.GW);
assert.equal(L.gh, Z.GH);
assert.equal(L.grid.length, Z.GH);
assert.ok(L.grid.every(row => row.length === Z.GW), 'grid dimensions match the server navigation contract');
assert.equal(L.zones.length, 8, 'all authored areas are present');
assert.equal(L.doors.length, 11, 'all authored connections are present');
const costs = L.doors.map(d => d.cost);
assert.ok(costs[0] <= costs[costs.length - 1], 'door costs grow toward later sectors');
assert.ok(costs.every((c, i) => i === 0 || c >= costs[i - 1] || c >= 750), 'door costs do not collapse in later zones');
assert.ok(L.windows.length >= 16, 'outer-wall zombie entry windows are present');
assert.ok(L.obst.length >= 40, 'the Cosmodrome has enough authored cover to break up long sightlines');
assert.ok(L.obst.some(o => o[5] === 'rocket'), 'a central launch-pad rocket has a collision footprint');
assert.ok(L.obst.some(o => o[5] === 'spinner'), 'the Ember Well has a spin-well core');
assert.ok((L.landers || []).length >= 4, 'Ash Pads connect the far zones');
assert.ok(L.power && L.forge, 'power switch and Inferno Forge are placed');
assert.ok(L.up, 'Ember Well has a starting balcony');

// Ranked and daily modes must keep their existing fixed map; this test also checks map switching is room-scoped.
const ranked = { ranked: true, mapId: 'cosmodrome', zombies: new Map() };
Z.resetMap(ranked);
Z.bind(ranked);
assert.notEqual(Z.layout().kind, 'cosmodrome', 'ranked rooms cannot be switched to the new map');
assert.equal(Z.GW, 40, 'rebinding the Refinery restores the classic grid size');

// Rebind the Cosmodrome and open all authored zones to test connected-floor reachability.
Z.resetMap(room);
room.open = (1 << L.zones.length) - 1;
Z.bind(room);
assert.equal(Z.GW, 72);
const start = Z.zoneSpawn();
const startCell = [Math.floor(start[0] / Z.CELL + Z.GW / 2), Math.floor(start[1] / Z.CELL + Z.GH / 2)];
const queue = [startCell], seen = new Set([startCell[1] * Z.GW + startCell[0]]);
for (let i = 0; i < queue.length; i++) {
  const [c, r] = queue[i];
  for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
    if (nc < 0 || nc >= Z.GW || nr < 0 || nr >= Z.GH) continue;
    const key = nr * Z.GW + c;
    const k = nr * Z.GW + nc;
    if (seen.has(k) || !Z.walk(room, Z.WX(nc), Z.WZ(nr), 0)) continue;
    seen.add(k); queue.push([nc, nr]);
  }
}
for (let zone = 0; zone < L.zones.length; zone++) {
  const [c0, c1, r0, r1] = L.zones[zone].r;
  let reachable = false;
  for (let r = r0; r <= r1 && !reachable; r++) for (let c = c0; c <= c1; c++) {
    if (seen.has(r * Z.GW + c) && Z.walk(room, Z.WX(c), Z.WZ(r), 0)) { reachable = true; break; }
  }
  assert.ok(reachable, `zone ${zone} (${L.zones[zone].n}) must be reachable with all doors open`);
}
const [sx, sz] = start;
Z.flow(room, [{ x: sx, z: sz, lv: 0 }]);
assert.ok(room.flowD.some(d => Number.isFinite(d) && d < 1e9), 'zombie flow field contains reachable cells');

// Closed doors keep later sectors sealed; zombies only enter through unlocked-zone windows.
Z.resetMap(room);
Z.bind(room);
assert.equal(room.open, 1);
const start2 = Z.zoneSpawn();
const sc2 = [Math.floor(start2[0] / Z.CELL + Z.GW / 2), Math.floor(start2[1] / Z.CELL + Z.GH / 2)];
const q2 = [sc2], seen2 = new Set([sc2[1] * Z.GW + sc2[0]]);
for (let i = 0; i < q2.length; i++) {
  const [c, r] = q2[i];
  for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
    if (nc < 0 || nc >= Z.GW || nr < 0 || nr >= Z.GH) continue;
    const k = nr * Z.GW + nc;
    if (seen2.has(k) || !Z.walk(room, Z.WX(nc), Z.WZ(nr), 0)) continue;
    seen2.add(k); q2.push([nc, nr]);
  }
}
for (let zone = 1; zone < L.zones.length; zone++) {
  const [c0, c1, r0, r1] = L.zones[zone].r;
  let hit = false;
  for (let r = r0; r <= r1 && !hit; r++) for (let c = c0; c <= c1; c++) {
    if (seen2.has(r * Z.GW + c) && Z.walk(room, Z.WX(c), Z.WZ(r), 0)) hit = true;
  }
  assert.equal(hit, false, `zone ${zone} stays sealed until its door is bought`);
}
const openWins = L.windows.map((w, i) => i).filter(i => Z.winOn(room, i));
assert.ok(openWins.length >= 1 && openWins.every(i => L.windows[i].zone === 0), 'zombies only enter through unlocked-zone windows');

// Ash Pads: power on, points spent, server-authoritative arrival at a remote pad.
room.power = 1;
room.open = (1 << L.zones.length) - 1;
const pad = L.landers[0], dest = L.landers[1];
const p = { id: 1, x: pad.x, z: pad.z, y: 0, alive: true, down: 0, pts: 5000, guns: ['flamer'], slot: 0, perks: 0, up: [], up2: [], in: {}, fuel: 100 };
room.players.set(1, p);
const ev = [];
Z.use(room, p, ev);
assert.equal(ev[0]?.e, 'lander');
assert.equal(ev[0]?.st, 'fly');
assert.equal(p.pts, 5000 - (L.landerCost || 250));
for (let i = 0; i < 50; i++) Z.tickLander(room, 0.1, ev);
assert.equal(room.lander.st, 'idle');
assert.equal(room.lander.pad, dest.id);
assert.ok(Math.hypot(p.x - dest.x, p.z - dest.z) < 0.2, 'the rider arrives on the destination pad');
assert.ok(!p.landerRide);

console.log('Ashen Cosmodrome map integration smoke test passed.');
