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

for (let i = 0; i < 500 && room.zombies.size < 4; i++) room.step(0.05);

const zombies = [...room.zombies.values()];
assert.ok(zombies.length >= 4, 'live room spawned enough zombies for squad-role assignment');
assert.ok(zombies.every(z => Tactics.ROLES.includes(z.role)), 'every live-spawned zombie receives a valid tactical role');
assert.equal(zombies[0].role, 'pursuer', 'first member is the squad pursuer');
assert.ok(zombies.some(z => z.role === 'flanker'), 'live squad includes a flanker when squad size permits');
assert.ok(zombies.every(z => typeof z.tacState === 'string'), 'live zombies carry a tactical state');

console.log('zombie-tactics-runtime: live spawn role integration passed');
