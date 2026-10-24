'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcz-tactics-runtime-'));
Object.assign(process.env, {
  DATA_DIR: dir,
  TOKEN_SECRET: 'tactics-runtime-test',
  DRY_RUN: 'true',
  TREASURY_ADDRESS: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp',
  BURN_JOB_IN_SERVER: 'false'
});

const { Room } = require('../server/game');
const Tactics = require('../server/zombie-tactics-core');
const room = new Room(1, 'zombie');
room.add({ name: 'tactics-test', ws: { send() {}, readyState: 1 } });

for (let i = 0; i < 500 && room.zombies.size < 5; i++) room.step(0.05);

const zombies = [...room.zombies.values()];
assert.ok(zombies.length >= 5, 'live room spawned enough zombies for squad-role assignment');
assert.ok(zombies.every(z => Tactics.ROLES.includes(z.role)), 'every live-spawned zombie receives a valid tactical role');
assert.equal(zombies[0].role, 'pursuer', 'first member is the squad pursuer');
assert.ok(zombies.some(z => z.role === 'flanker'), 'live squad includes a flanker when squad size permits');
assert.ok(zombies.every(z => typeof z.tacState === 'string'), 'live zombies carry a tactical state');


const Z = require('../server/cod');
Z.bind(room);
const map = Z.layout();
const cell = map.cell, gw = map.gw, gh = map.gh;
const openCells = [];
for (let row = 0; row < gh; row++) for (let col = 0; col < gw; col++) {
  const x = (col - gw / 2 + 0.5) * cell;
  const z = (row - gh / 2 + 0.5) * cell;
  if (Z.inside(room, x, z, 0.32, 0)) openCells.push({ x, z });
}
let wallBlockedPair = null, clearPair = null;
for (let i = 0; i < openCells.length && (!wallBlockedPair || !clearPair); i++) {
  for (let j = i + 1; j < openCells.length; j++) {
    const a = openCells[i], b = openCells[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d < 4 || d > 12) continue;
    if (!clearPair && Z.los(room, a.x, a.z, b.x, b.z, 0, 0)) clearPair = [a, b];
    if (!wallBlockedPair && !Z.los(room, a.x, a.z, b.x, b.z, 0, 0)) wallBlockedPair = [a, b];
    if (wallBlockedPair && clearPair) break;
  }
}
assert.ok(clearPair, 'generated map provides a walkable, visible same-floor route sample');
assert.ok(wallBlockedPair, 'generated map provides a wall/door-blocked route sample');
assert.ok(Tactics.validateApproachTarget({
  approach: clearPair[1], sameFloor: true,
  isWalkable: (x, z) => Z.inside(room, x, z, 0.32, 0),
  hasLineOfSight: (x, z) => Z.los(room, clearPair[0].x, clearPair[0].z, x, z, 0, 0)
}), 'real map walkability and LOS accept a clear approach');
assert.equal(Tactics.validateApproachTarget({
  approach: wallBlockedPair[1], sameFloor: true,
  isWalkable: (x, z) => Z.inside(room, x, z, 0.32, 0),
  hasLineOfSight: (x, z) => Z.los(room, wallBlockedPair[0].x, wallBlockedPair[0].z, x, z, 0, 0)
}), null, 'real map LOS rejects a flank destination behind a wall or closed door');

console.log('zombie-tactics-runtime: live role and obstacle-aware route integration passed');
