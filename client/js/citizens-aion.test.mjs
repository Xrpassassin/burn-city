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
console.log('AION citizen memory pilot ok');
