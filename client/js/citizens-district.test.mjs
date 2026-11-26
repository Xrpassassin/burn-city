import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCitizen } from './citizens-core.mjs';
import { DISTRICT_CAST, districtTargets, makeDistrict } from './citizens-district.mjs';

const models = JSON.parse(readFileSync(new URL('../assets/citizens/models.json', import.meta.url)));
const knownModels = models.models.map(model => model.id);
assert.equal(new Set(DISTRICT_CAST.map(person => person.id)).size, 4);
for (const person of DISTRICT_CAST) assert.deepEqual(validateCitizen(person, knownModels), []);

const coffee = { door: { x: 20, z: 30 }, yaw: Math.PI / 2 };
const obstacle = { x: 14.7, z: 30.85, r: 1 };
const targets = districtTargets(coffee, [obstacle]);
assert.ok(Math.hypot(targets['district:left'].x - obstacle.x, targets['district:left'].z - obstacle.z) >= 1.65);
assert.ok(targets['district:left'].z > targets['district:right'].z);

const saved = new Map();
const storage = {
  getItem: key => saved.get(key),
  setItem: (key, value) => saved.set(key, value)
};
const district = makeDistrict(storage);
const present = new Set(DISTRICT_CAST.map(person => person.id).concat('maya', 'skye'));
const arrived = id => present.has(id);
district.tick(9, arrived);
assert.equal(district.phase, 'gathering');
district.tick(3, arrived);
assert.equal(district.phase, 'clash');
assert.equal(district.coffeeClosed, false);
assert.equal(district.recall('maya'), null);
district.tick(7, arrived);
assert.equal(district.phase, 'aftermath');
assert.equal(district.coffeeClosed, true);
assert.match(district.assignment('ines').activity, /Checking on Maya/);
assert.match(district.assignment('roe').activity, /Following/);
assert.match(district.recall('maya'), /Roe get in Jax/);
assert.match(district.recall('skye'), /Jax made the first move/);
assert.equal(district.recall('maya'), null);
district.tick(75, arrived);
assert.equal(district.phase, 'settled');
assert.equal(district.coffeeClosed, false);
const firstPatrol = district.assignment('ines').place;
district.tick(12, arrived);
assert.notEqual(district.assignment('ines').place, firstPatrol);
assert.equal(makeDistrict(storage).outcome, 'clash');
assert.equal(makeDistrict(storage).phase, 'settled');

district.tick(28, arrived);
assert.equal(district.phase, 'mediation');
assert.equal(district.assignment('skye').place, 'district:arcade-witness');
present.delete('skye');
district.tick(12, arrived);
assert.equal(district.phase, 'mediation');
district.tick(138, arrived);
assert.equal(district.phase, 'settled');
assert.equal(district.outcome, 'walkout');
assert.match(district.recall('roe'), /owe the precinct a report/);
assert.match(district.recall('roe'), /without an agreement/);
assert.equal(district.recall('skye'), null);

present.add('skye');
district.tick(40, arrived);
assert.equal(district.phase, 'mediation');
district.tick(12, arrived);
assert.equal(district.outcome, 'truce');
assert.equal(district.phase, 'settled');
assert.match(district.recall('skye'), /finally agreed/);
const restored = makeDistrict(storage);
assert.equal(restored.outcome, 'truce');
assert.match(restored.assignment('roe').activity, /away from the arcade/);
restored.tick(40, arrived);
assert.equal(restored.phase, 'community');
assert.equal(restored.assignment('dex').place, 'district:arcade-door');
present.add('dex');
restored.tick(20, arrived);
assert.match(restored.recall('dex'), /Skye showed me around/);
restored.tick(40, arrived);
restored.tick(20, arrived);
assert.equal(restored.recall('dex'), null);

const noArcade = makeDistrict(storage, false);
noArcade.tick(1000, arrived);
assert.equal(noArcade.phase, 'settled');
assert.notEqual(noArcade.assignment('roe').place, 'district:arcade-left');
assert.equal(makeDistrict({ getItem: () => 'unknown-outcome' }).phase, 'routine');
assert.equal(makeDistrict({ getItem() { throw Error('blocked'); } }).phase, 'routine');

const unwitnessed = makeDistrict();
present.delete('maya');
unwitnessed.tick(9, arrived);
unwitnessed.tick(3, arrived);
unwitnessed.tick(7, arrived);
assert.equal(unwitnessed.coffeeClosed, false);
assert.equal(unwitnessed.recall('maya'), null);
assert.match(unwitnessed.assignment('ines').activity, /Patrolling/);

const interrupted = makeDistrict();
present.delete('jax');
interrupted.tick(9, arrived);
interrupted.tick(45, arrived);
assert.equal(interrupted.phase, 'aborted');
assert.equal(interrupted.coffeeClosed, false);
assert.equal(interrupted.recall('skye'), null);
interrupted.tick(45, arrived);
assert.equal(interrupted.phase, 'gathering');
console.log('AION living district: cast, autonomous incident, witness memories, closure and patrol passed');
