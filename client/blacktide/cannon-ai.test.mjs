import assert from 'node:assert/strict';
import { updateNpcCannons, stepNpcProjectile, projectileHitsPlayer, NPC_CANNON } from './cannon-ai.js';

const enemy = {
  id: 'patrol-test', kind: 'patrol', alive: true, aiState: 'engage',
  group: { position: { x: 20, z: 0 } },
  cannonWindup: 0, cannonReload: 0, cannonReady: false
};
const player = { x: 0, z: 0 };
assert.deepEqual(updateNpcCannons([enemy], player, 0.1), []);
assert.ok(enemy.cannonWindup > 0, 'must telegraph before firing');
let shots = [];
for (let i = 0; i < 12; i++) shots.push(...updateNpcCannons([enemy], player, 0.1));
assert.equal(shots.length, 1, 'one shot after telegraph');
assert.equal(shots[0].damage, NPC_CANNON.damage);
assert.ok(shots[0].vx < 0, 'shot should aim toward the player');
assert.ok(enemy.cannonReload > 0, 'shot starts reload');
assert.deepEqual(updateNpcCannons([enemy], player, 0.1), [], 'reload prevents immediate repeat');

const outside = { ...enemy, cannonWindup: 0, cannonReload: 0, cannonReady: false, group: { position: { x: 100, z: 0 } } };
assert.deepEqual(updateNpcCannons([outside], player, 0.1), []);
const merchant = { ...enemy, kind: 'merchant', cannonWindup: 0, cannonReload: 0, cannonReady: false };
assert.deepEqual(updateNpcCannons([merchant], player, 0.1), []);

const projectile = { x: 0, z: 0, vx: 10, vz: 0, life: 1 };
assert.equal(projectileHitsPlayer(projectile, player), true);
stepNpcProjectile(projectile, 0.1);
assert.equal(projectile.x, 1);
assert.equal(projectileHitsPlayer({ x: 30, z: 0 }, player), false);
const crossing = {x:-5,z:0,vx:100,vz:0,life:2};
stepNpcProjectile(crossing,0.1);
assert.equal(projectileHitsPlayer(crossing,{x:0,z:0},1),true,'fast cannonball crosses ship');
assert.equal(projectileHitsPlayer(crossing,{x:0,z:3},1),false,'distant ship is not hit');
assert.equal(projectileHitsPlayer(crossing,{x:0,z:0},-1),false,'negative radius is rejected');
console.log('Blacktide NPC cannon tests passed');
