import assert from 'node:assert/strict';
import {TAVERN_CAST} from './tavern-characters.mjs';
assert.equal(TAVERN_CAST.length,3);
assert.equal(new Set(TAVERN_CAST.map(n=>n.id)).size,TAVERN_CAST.length);
assert.ok(TAVERN_CAST.some(n=>n.id==='silas-reed'));
for(const npc of TAVERN_CAST){assert.ok(Number.isFinite(npc.x)&&Number.isFinite(npc.z));assert.ok(npc.name&&npc.role);}
console.log('Tavern NPC cast tests passed');
