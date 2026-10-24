// Fixed-map integration smoke test for The Ashen Cosmodrome.
// Exercises the real server map builder and flow-field navigation; no server process or network required.
const assert = require('node:assert/strict');
delete process.env.ZOMBIE_CLASSIC;
delete process.env.ZOMBIE_MAP;
delete process.env.FLY_APP_NAME;

const Z = require('../server/cod');
const room = { ranked: false, daily: null, mapId: 'cosmodrome', zombies: new Map() };
Z.resetMap(room);
Z.bind(room);

const L = Z.layout();
assert.equal(L.kind, 'cosmodrome', 'explicit map choice selects the fixed Cosmodrome');
assert.equal(L.name, 'The Ashen Cosmodrome');
assert.equal(L.zones.length, 7, 'all authored areas are present');
assert.equal(L.doors.length, 7, 'all authored connections are present');
assert.ok(L.windows.length >= 8, 'outer-wall zombie entry windows are present');
assert.ok(L.obst.length >= 35, 'the Cosmodrome has enough authored cover to break up open square sightlines');
assert.ok(L.obst.some(o => o[0] === 17 && o[2] === 19), 'access spine has offset cover to shape the route');
assert.ok(L.obst.some(o => o[0] === 30 && o[2] === 26), 'launch gantry has a second cover island');
assert.equal(L.grid.length, Z.GH);
assert.ok(L.grid.every(row => row.length === Z.GW), 'grid dimensions match the server navigation contract');

// Ranked and daily modes must keep their existing fixed map; this test also checks map switching is room-scoped.
const ranked = { ranked: true, mapId: 'cosmodrome', zombies: new Map() };
Z.resetMap(ranked);
Z.bind(ranked);
assert.notEqual(Z.layout().kind, 'cosmodrome', 'ranked rooms cannot be switched to the new map');

// Rebind the Cosmodrome and open all authored zones to test connected-floor reachability.
Z.resetMap(room);
room.open = (1 << L.zones.length) - 1;
Z.bind(room);
const start = Z.zoneSpawn();
const startCell = [Math.floor(start[0] / Z.CELL + Z.GW / 2), Math.floor(start[1] / Z.CELL + Z.GH / 2)];
const queue = [startCell], seen = new Set([startCell[1] * Z.GW + startCell[0]]);
for (let i = 0; i < queue.length; i++) {
  const [c, r] = queue[i];
  for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
    if (nc < 0 || nc >= Z.GW || nr < 0 || nr >= Z.GH) continue;
    const key = nr * Z.GW + nc;
    if (seen.has(key) || !Z.walk(room, Z.WX(nc), Z.WZ(nr), 0)) continue;
    seen.add(key); queue.push([nc, nr]);
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
console.log('Ashen Cosmodrome map integration smoke test passed.');
