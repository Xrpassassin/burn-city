import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from './vendor/three.module.min.js';
import {worldSurfaceUVs,SURFACE_PACK} from './homefront-surface-materials.mjs';
const root=new URL('./assets/homefront/surfaces/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('sources.json',root),'utf8'));
assert.equal(manifest.license,'CC0-1.0');
assert.equal(manifest.files.length,9);
let total=0;
for(const file of manifest.files){
 const bytes=await readFile(new URL(file.file,root));total+=bytes.length;
 assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,'bundled texture matches its recorded provenance');
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
}
assert.ok(total<700000,'all three scanned materials fit a bounded download budget');
for(const kind of Object.values(SURFACE_PACK))assert.ok(manifest.assets.some(a=>a.id===kind.asset));
// A ten-metre wall gets five repeats of a two-metre scan, rather than
// stretching one image over the whole wall. All six box faces retain area.
const box=new THREE.BoxGeometry(10,3,2);
worldSurfaceUVs(THREE,box,2);
const uv=box.attributes.uv;
for(let face=0;face<6;face++){
 const u=[],v=[];for(let i=face*4;i<face*4+4;i++){u.push(uv.getX(i));v.push(uv.getY(i));}
 assert.ok(Math.max(...u)>Math.min(...u)&&Math.max(...v)>Math.min(...v),'surface UVs never collapse on a box face');
 if(face===4)assert.equal(Math.max(...u)-Math.min(...u),5);
}
box.dispose();
console.log('Homefront scanned surfaces: provenance, WebP budget and world-scale UVs passed');
