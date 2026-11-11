import assert from 'node:assert/strict';
import { groundDetailCandidates } from './homefront-ground-detail.mjs';

const a = groundDetailCandidates(-1, 0, { count: 80 });
const b = groundDetailCandidates(-1, 0, { count: 80 });
assert.deepEqual(a, b, 'ground dressing remains stable between rebuilds');
assert.equal(new Set(a.map(item => item.id)).size, a.length, 'ground detail IDs are unique within a chunk');
assert(a.every(item => Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.z) && item.scale > 0));
assert(a.every(item => item.x >= -64 && item.x < 0 && item.z >= 0 && item.z < 64));
assert(a.every(item => item.kind === 'rock' || item.kind === 'tuft'));
assert(a.every(item => Math.hypot(item.x, item.z) >= 14), 'spawn clearing remains uncluttered');
assert.throws(() => groundDetailCandidates(0, 0, { count: 257 }), TypeError);
console.log('Homefront ground detail tests passed');


import * as THREE from './vendor/three.module.min.js';
import {createHomefrontTuftGeometry,createHomefrontRubbleGeometry} from './homefront-ground-meshes.mjs';
const tuft=createHomefrontTuftGeometry(THREE),stone=createHomefrontRubbleGeometry(THREE);
const p=tuft.getAttribute('position'),c=tuft.getAttribute('color');
assert(p.count>50&&p.count<100,'seven sculpted blades remain a tiny shared mesh');
assert.equal(c.count,p.count,'all blades have subtle shader-lit vertex shades');
assert([...p.array,...c.array].every(Number.isFinite));
assert([...p.array].filter((_,i)=>i%3===1).every(y=>y>=0&&y<=.75),'grass starts on soil');
assert(Math.min(...c.array)>=0.7&&Math.max(...c.array)<=1,'weathering does not overbrighten grass');
assert(stone.getAttribute('position').count>0);
assert([...stone.getAttribute('position').array].every(Number.isFinite));
const flat=stone.getAttribute('position').array;
assert(Math.max(...flat.filter((_,i)=>i%3===1))<.25,'rubble stays low and partly embedded');
tuft.dispose();stone.dispose();

import {createHomefrontFieldPackGeometry} from './homefront-field-pack.mjs';
const gear=createHomefrontFieldPackGeometry(THREE);
const gearVertices=gear.getAttribute('position');
assert(gearVertices.count>60&&gearVertices.count<1200,'sculpted gear has controlled topology');
assert([...gearVertices.array].every(Number.isFinite),'field gear mesh must contain only finite vertices');
assert(gear.boundingSphere.radius<1,'field gear remains wearable, not a world obstacle');
gear.dispose();
