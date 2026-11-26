import assert from 'node:assert/strict';
import { makeCitizenMemory, observeVisit, recallLine, MAX_EPISODES } from './citizens-aion.mjs';
assert.equal(makeCitizenMemory('unknown'), null);
assert.equal(makeCitizenMemory('__proto__'), null);
assert.equal(recallLine(null, 'shop:coffee'), null);
observeVisit(null, 'shop:coffee');
const a = makeCitizenMemory('maya'), b = makeCitizenMemory('maya'), s = makeCitizenMemory('skye');
assert.equal(recallLine(a, 'spawn'), null);
assert.match(recallLine(a, 'shop:coffee'), /first shift/);
assert.equal(recallLine(a, 'shop:coffee'), null);
assert.match(recallLine(b, 'shop:coffee'), /first shift/);
assert.match(recallLine(s, 'shop:coffee'), /coach/);
observeVisit(a, 'shop:coffee'); observeVisit(a, 'shop:coffee');
assert.equal(a.episodes.length, 1);
observeVisit(a, 'shop:mart'); observeVisit(a, 'shop:coffee');
assert.match(recallLine(a, 'shop:coffee'), /familiar stop/);
assert.equal(recallLine(a, 'shop:coffee'), null);
for (let i=0;i<100;i++) observeVisit(a, 'place:'+i);
assert.equal(a.episodes.length, MAX_EPISODES);
assert.equal(b.episodes.length, 0);
for (const [id, places] of [['maya',['shop:coffee','shop:mart','shop:arcade']],['skye',['shop:arcade','tower:BURN','shop:coffee']],['dex',['spawn','fire','ems']]]) {
  const m = makeCitizenMemory(id);
  for (const p of places) { const line = recallLine(m,p); assert.ok(line && line.length <= 140); }
}

const saved = new Map();
const storage = {
  getItem: key => saved.get(key),
  setItem: (key, value) => saved.set(key, value)
};
const persistent = makeCitizenMemory('maya', storage);
for (const place of ['shop:coffee', 'shop:mart', 'shop:coffee']) {
  observeVisit(persistent, place, storage);
}
assert.match(recallLine(persistent, 'shop:coffee'), /first shift/);
assert.match(recallLine(persistent, 'shop:coffee'), /familiar stop/);

const reloaded = makeCitizenMemory('maya', storage);
assert.deepEqual(reloaded.episodes, persistent.episodes);
observeVisit(reloaded, 'shop:coffee', storage);
assert.equal(reloaded.episodes.length, 3, 'reloading at the same stop adds no visit');
assert.match(recallLine(reloaded, 'shop:coffee'), /first shift/);
assert.match(recallLine(reloaded, 'shop:coffee'), /familiar stop/);
assert.deepEqual(makeCitizenMemory('maya').episodes, []);
assert.deepEqual(makeCitizenMemory('skye', storage).episodes, []);

for (let i = 0; i < 20; i++) {
  observeVisit(reloaded, i % 2 === 0 ? 'shop:arcade' : 'spawn', storage);
}
assert.deepEqual(makeCitizenMemory('maya', storage).episodes, reloaded.episodes);
assert.equal(reloaded.episodes.length, MAX_EPISODES);
for (const value of ['{broken', '[null]', '["shop:coffee","unrecognized"]',
  '["spawn","spawn"]', JSON.stringify(Array(MAX_EPISODES + 1).fill('spawn'))]) {
  assert.deepEqual(makeCitizenMemory('maya', { getItem: () => value }).episodes, []);
}
const blockedStorage = {
  getItem() { throw new Error('storage access blocked'); },
  setItem() { throw new Error('storage write blocked'); }
};
const fallback = makeCitizenMemory('dex', blockedStorage);
observeVisit(fallback, 'fire', blockedStorage);
assert.deepEqual(fallback.episodes, ['fire']);

console.log('AION citizen memory pilot ok');
