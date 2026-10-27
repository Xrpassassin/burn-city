import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./city-qa-adapter.mjs',import.meta.url),'utf8');
function boot({host='localhost',search='?qa=1',ready=false}={}){
 const w={__ready:ready};
 const elements={hud:{},btns:{},touch:{}};
 const context={
  location:{hostname:host,search},
  performance:{now:()=>1234},
  window:w,
  URLSearchParams,
  Number,Math,Object,
  document:{
   getElementById:id=>elements[id]||null,
   querySelector:()=>null
  }
 };
 runInNewContext(source,context);
 return {w,elements,context};
}
for(const host of ['burn.city','evil.localhost','127.0.0.2']){
 assert.equal(boot({host}).w.__BURN_QA__,undefined);
}
assert.equal(boot({search:''}).w.__BURN_QA__,undefined);
const {w,context}=boot();
assert.equal(w.__BURN_QA__.status().phase,'boot');
w.__R={domElement:{getBoundingClientRect:()=>({width:390,height:844})},info:{render:{calls:42,triangles:1234}}};
w.__city={C:{position:{x:1.234,y:2,z:3}}};
w.__ready=true;
const result=w.__BURN_QA__.status();
assert.equal(result.phase,'ready');
assert.equal(result.canvas.width,390);
assert.equal(result.canvas.height,844);
assert.equal(result.camera.x,1.23);
assert.equal(result.render.calls,42);
assert.equal(result.interface.hud,true);
assert.equal(result.interface.touchControls,true);
assert.equal('wallet' in result,false);
assert.equal('token' in result,false);
assert.equal(Object.isFrozen(result),true);
assert.equal(Object.isFrozen(result.camera),true);
assert.equal(Object.isFrozen(w.__BURN_QA__),true);
assert.equal(Object.getOwnPropertyDescriptor(w,'__BURN_QA__').writable,false);
assert.equal(boot({host:'127.0.0.1'}).w.__BURN_QA__.version,1);
console.log('City QA adapter unit tests passed');

// Integration guard: the City entry page must load the QA module before app boot.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(resolve(root,'index.html'),'utf8');
const qaScript='<script type="module" src="js/city-qa-adapter.mjs"></script>';
const appScript='<script type="module" src="js/app.js"></script>';
assert.equal(html.split(qaScript).length-1,1,'QA adapter should load exactly once');
assert.ok(html.indexOf(qaScript)<html.indexOf(appScript),'QA adapter must load before app');
assert.ok(html.includes('id="hud"')&&html.includes('id="btns"')&&html.includes('id="touch"'));
console.log('City QA HTML integration guard passed');
