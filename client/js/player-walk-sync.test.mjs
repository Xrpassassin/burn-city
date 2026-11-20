// Player walk animation: Gas Mask Guy Walk/Run clips are measured and time-scaled to real ground
// speed (no foot skating), the mixer survives bad frame times, and every on-foot path animates
// the local player, NFT holders included (they were frozen in bind pose on the island/in homes).
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
globalThis.document??={createElement:()=>({getContext:()=>null,style:{}}),createElementNS:()=>({style:{}})};
globalThis.self??=globalThis;
globalThis.ProgressEvent??=class extends Event{constructor(t,o={}){super(t);Object.assign(this,o);}};
const THREE=await import('three');
const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
const {FALLBACK_STRIDE_SPEED,measureStrideSpeeds,locomotionTimeScale}=await import('./default-player-avatar.mjs');
const {MOTION}=await import('./player-motion.mjs');

// --- time-scale maths ---
const ss={Walk:1.1,Run:1.3};
assert.equal(locomotionTimeScale('Idle',5,ss),1,'idle plays at its authored rate');
assert.equal(locomotionTimeScale('Walk',undefined,ss),1,'no speed -> authored rate (peers/legacy callers)');
assert.equal(locomotionTimeScale('Walk',NaN,ss),1,'NaN speed is ignored');
assert(Math.abs(locomotionTimeScale('Walk',1.1*1.5,ss,1.5)-1)<1e-9,'natural speed (scaled to avatar size) plays at 1x');
assert(locomotionTimeScale('Walk',MOTION.walk,ss,1.1)>1.5,'5 m/s walk speeds the Walk clip up');
assert(locomotionTimeScale('Run',MOTION.run,ss,1.1)>locomotionTimeScale('Walk',MOTION.walk,ss,1.1),'sprinting cycles faster than walking');
for(const [st,v] of [['Walk',.01],['Walk',99],['Run',.01],['Run',99]]){const k=locomotionTimeScale(st,v,ss);assert(k>=.6&&k<=3.2,`${st}@${v} clamped, got ${k}`);}
assert(locomotionTimeScale('Walk',3,{})>0,'missing measurement falls back');
assert.deepEqual(Object.keys(FALLBACK_STRIDE_SPEED).sort(),['Run','Walk']);

// --- measure the real clips (textures stripped; geometry + skeleton + animations only) ---
const dir=new URL('../assets/players/',import.meta.url);
for(const file of ['gas-mask-guy.gltf','gas-mask-guy-lod.gltf']){
 const g=JSON.parse(readFileSync(new URL(file,dir),'utf8'));
 g.buffers=g.buffers.map(b=>({...b,uri:'data:application/octet-stream;base64,'+readFileSync(new URL(b.uri,dir)).toString('base64')}));
 delete g.images;delete g.textures;delete g.samplers;
 for(const m of g.materials||[]){if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
 const gltf=await new Promise((ok,no)=>new GLTFLoader().parse(JSON.stringify(g),'',ok,no));
 const clips=Object.fromEntries(gltf.animations.map(c=>[c.name,c]));
 for(const n of ['Idle','Walk','Run'])assert(clips[n]&&clips[n].duration>.3,`${file} has a ${n} clip`);
 const before=[];gltf.scene.traverse(o=>before.push(o.quaternion.toArray().join()+o.position.toArray().join()));
 const s=measureStrideSpeeds(gltf.scene,new Map(Object.entries(clips)));
 const after=[];gltf.scene.traverse(o=>after.push(o.quaternion.toArray().join()+o.position.toArray().join()));
 assert.deepEqual(after,before,'measuring leaves the shared source scene in bind pose');
 console.log(file,'stride speeds',JSON.stringify(s));
 for(const n of ['Walk','Run'])assert(s[n]>.5&&s[n]<4&&s[n]!==FALLBACK_STRIDE_SPEED[n],`${file} ${n} stride speed is plausible, got ${s[n]}`);
 // legs genuinely move during Walk: foot bones travel back and forth
 const mixer=new THREE.AnimationMixer(gltf.scene),feet=[];gltf.scene.traverse(o=>{if(o.isBone&&/^foot[LR]$/.test(o.name))feet.push(o);});
 assert.equal(feet.length,2,`${file} has footL/footR bones`);
 mixer.clipAction(clips.Walk).play();const zs=[];const v=new THREE.Vector3();
 for(let i=0;i<8;i++){mixer.setTime(i*clips.Walk.duration/8);gltf.scene.updateMatrixWorld(true);zs.push(feet[0].getWorldPosition(v).z);}
 assert(Math.max(...zs)-Math.min(...zs)>.2,`${file} Walk clip strides the legs`);
}

// --- wiring ---
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const walker=readFileSync(new URL('./walker.js',import.meta.url),'utf8');
const ph=readFileSync(new URL('./nft-avatar-placeholder.js',import.meta.url),'utf8');
const dpa=readFileSync(new URL('./default-player-avatar.mjs',import.meta.url),'utf8');
assert.equal((app.match(/poseWalker\(avatar,/g)||[]).length,1,'the local walker is posed only through poseMe');
assert((app.match(/\bposeMe\(dt,/g)||[]).length>=3,'city, Estates island and home interiors all pose the local player');
assert(/function poseMe[^]*?L\.nftCharacter&&L\.nftCharacter\.userData\.anim\)L\.nftCharacter\.userData\.anim\(t,amp>\.05,!!P\.climb,run,L\.groundSpeed\)/.test(app),'NFT holders animate on every path with speed');
assert(/defaultAvatar\?\.update\([^;]*,\s*speed\)/.test(walker),'poseWalker forwards ground speed to the mixer');
assert(/poseWalker\(walker,t\*9,moving\?1:0,t,!!running,speed\)/.test(ph),'NFT placeholder forwards running + speed');
assert(/Number\.isFinite\(dt\)/.test(dpa),'mixer ignores NaN frame times');
assert(!/mixamo/i.test(dpa),'no Mixamo assets');
console.log('Player walk sync: measured strides, speed-synced Walk/Run, NaN-safe mixer, all paths animate NFT holders');
