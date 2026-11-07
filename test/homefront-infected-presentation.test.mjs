import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { infectedPresentation, visibleInfected } from '../client/arena/homefront-infected-presentation.mjs';
import { createZombieAudio } from '../client/arena/zaudio.js';

const require = createRequire(import.meta.url);
const Combat = require('../server/homefront-combat.js');
const Core = require('../server/homefront-core.js');
const now = Date.now();
const encounter = Combat.resolveSpawn({ account: 'survivor', x: 0, z: 0, district: 'perimeter', now });
encounter.x = 2;
encounter.z = 0;
encounter.hp = encounter.maxHp = 200;
encounter.range = 8;
encounter.members = [
  { id: 'first', x: 2, z: 0, hp: 100, maxHp: 100, defeated: false },
  { id: 'second', x: 2, z: 1, hp: 100, maxHp: 100, defeated: false }
];

const shown = visibleInfected([Combat.publicEncounter(encounter)]);
assert.deepEqual(shown.map(item => item.id), ['first', 'second']);
assert.equal(shown[1].parentEncounterId, encounter.id);
const result = Combat.attack({
  encounters: { survivor: encounter }, account: 'survivor',
  player: { x: 0, z: 0 }, base: Core.createBase('survivor'),
  now, targetId: shown[1].id, aimPoint: { x: shown[1].x, y: 1.2, z: shown[1].z }
});
assert.equal(result.hitTargetId, 'second');
assert.equal(result.encounter.members[0].hp, 100, 'aiming at the second body leaves the first unharmed');
assert(result.encounter.members[1].hp < 100);
result.encounter.members[1].hp = 0;
result.encounter.members[1].defeated = true;
assert.deepEqual(visibleInfected([result.encounter]).map(item => item.id), ['first']);
assert.equal(visibleInfected([{ ...encounter, defeated: true }]).length, 0);
assert.equal(visibleInfected([{ ...encounter, members: undefined }])[0].id, encounter.id);
assert.equal(infectedPresentation('Runner').ty, 1);
assert.equal(infectedPresentation('Crawler').cr, true);

const voices = [];
const sound = { hb: {}, loadBank() {}, listen() {}, heartbeat() {},
  play(key, options) { voices.push({ key, ...options }); } };
const audio = createZombieAudio(sound, {
  isVoiceObstructed: (listener, source) => listener[1] === 1.6 && source[0] > 0
});
audio.start();
audio.tick(5, { x: 0, y: 0, z: 0, hp: 100, alive: true }, [
  { id: 'behind-wall', x: 5, y: 0, z: 2 },
  { id: 'in-open', x: -5, y: 0, z: 2 }
], [], 'local');
const [behindWall, inOpen] = voices;
assert.deepEqual(behindWall.pos, [5, 1.5, 2], 'cover keeps the infected sound in its real direction');
assert.deepEqual(inOpen.pos, [-5, 1.5, 2]);
assert.equal(behindWall.cutoff, 780);
assert.equal(inOpen.cutoff, undefined);
assert.ok(behindWall.v < inOpen.v, 'cover softens the infected voice');
console.log('Homefront individual infected presentation and target selection passed');
