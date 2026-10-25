import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('./estates-island-renderer.mjs',import.meta.url),'utf8');
for (const name of ['-roof-edge-','-ridge','-roof-parapet-front','-roof-parapet-','-awning']) assert.ok(src.includes(name),name);
assert.match(src,/if\(item\.tier==='starter'\|\|item\.tier==='family'\|\|mansion\)/);
assert.match(src,/if\(apartment\)/);
console.log('Estates roof silhouette source checks passed');
