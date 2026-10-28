import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCityNature} from './city-nature-plan.mjs';
import {planBirdFlocks} from './city-birds-plan.mjs';

const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
assert(app.includes("import {installCityNature} from './city-nature-render.mjs'"));
assert(app.includes("import {installCityBirds} from './city-birds-render.mjs'"));
assert(app.includes("Q.has('nonature')")&&app.includes("Q.has('nobirds')"));

const districts=[
 {name:'BURN',pos:{x:180,z:100},distR:58,w:7},
 {name:'IMM',pos:{x:-170,z:140},distR:64,w:8}
];
const onRoad=(x,z)=>Math.abs(z-100)<5;
for(const tier of ['low','medium','high']){
 const nature=planCityNature({nodes:districts,onRoad,tier});
 const birds=planBirdFlocks({nodes:districts,tier});
 assert(nature.every(p=>!onRoad(p.x,p.z)));
 assert(nature.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.height)));
 assert(birds.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
 assert(nature.length<=({low:140,medium:540,high:1200})[tier]);
 assert(birds.length<=({low:0,medium:8,high:18})[tier]);
}
console.log('city environment integration smoke checks passed');
