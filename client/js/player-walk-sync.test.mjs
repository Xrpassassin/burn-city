// Player walk animation: Gas Mask Guy steps by distance travelled (one phase shared by Walk / Run /
// Sprint, blended by real ground speed), so the planted boot never slides; the mixer survives bad frame
// times, and every on-foot path animates the local player, NFT holders included (#668).
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
globalThis.document??={createElement:()=>({getContext:()=>null,style:{}}),createElementNS:()=>({style:{}})};
globalThis.self??=globalThis;
globalThis.ProgressEvent??=class extends Event{constructor(t,o={}){super(t);Object.assign(this,o);}};
const THREE=await import('three');
const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
const {clone}=await import('../vendor/three/examples/jsm/utils/SkeletonUtils.js');
const {locomotionTarget,naturalSpeed}=await import('./default-player-avatar.mjs');
const {GAIT_CLIPS,GAIT_BANDS,gaitWeights,blendedStride,advancePhase}=await import('./player-gait.mjs');
const {MOTION}=await import('./player-motion.mjs');

// --- blend + phase maths ---
const sum=w=>w.Idle+w.Walk+w.Run+w.Sprint;
for(const v of [0,.1,.3,1,2,2.3,3,5,6,8,20,NaN,-1]){const w=gaitWeights(v);assert(Math.abs(sum(w)-1)<1e-9,`weights sum to 1 at ${v}`);for(const k in w)assert(w[k]>=0&&w[k]<=1);}
assert.equal(gaitWeights(0).Idle,1,'standing still = Idle');
assert.equal(gaitWeights(.05).Idle,1,'pushing into a wall (speed ~0) = Idle even with the stick held');
assert.equal(gaitWeights(1.4).Walk,1,'stroll = Walk');
assert.equal(gaitWeights(3.6).Run,1,'jog = Run');
assert.equal(gaitWeights(9).Sprint,1,'sprint = Sprint');
assert(gaitWeights((GAIT_BANDS.run[0]+GAIT_BANDS.run[1])/2).Walk>0&&gaitWeights((GAIT_BANDS.run[0]+GAIT_BANDS.run[1])/2).Run>0,'walk->run crossfades');
let last=-1;for(let v=0;v<12;v+=.05){const s=blendedStride(gaitWeights(v));assert(s>=last-1e-9,'stride never shrinks as speed rises');last=s;}
assert.equal(advancePhase(.25,0,.016,1.4),.25,'no movement, no stepping');
assert.equal(advancePhase(.9,1.4,.1,1.4),(.9+.1)%1,'phase wraps');
assert(Math.abs(advancePhase(0,GAIT_CLIPS.Walk.stride,1,GAIT_CLIPS.Walk.stride))<1e-9,'one stride of travel = one full cycle');
assert.equal(advancePhase(.3,NaN,.1,1),.3,'NaN speed is ignored');
// world scale: the avatar is 2 tall (scale 2/1.8); in-game speeds map to the right clips
const S=2/1.8;
assert(locomotionTarget('Walk',MOTION.walk,S).weights.Run===1,`${MOTION.walk} m/s (keyboard walk) jogs`);
assert(locomotionTarget('Run',MOTION.run,S).weights.Sprint===1,`${MOTION.run} m/s (Shift) sprints`);
assert(locomotionTarget('Walk',1.2,S).weights.Walk===1,'gentle stick = walk');
assert(locomotionTarget('Walk',MOTION.walk*.68,S*.82).weights.Run>.5,'Homefront yard walk (0.68x, avatar 0.82x) jogs');
assert.equal(locomotionTarget('Walk',undefined,S).speed,naturalSpeed('Walk'),'no speed -> authored Walk pace (older callers)');
assert.equal(locomotionTarget('Idle',undefined,S).weights.Idle,1);
// cadence stays human: steps per second at the in-game speeds
for(const v of [MOTION.walk,MOTION.run]){const t=locomotionTarget('Walk',v,S);const hz=t.speed/blendedStride(t.weights)*2;assert(hz>1.4&&hz<4.8,`${v} m/s -> ${hz.toFixed(2)} steps/s`);console.log(`${v} m/s: ${(hz*60).toFixed(0)} steps/min`);}

// --- the real clips: smooth, distance-driven, planted feet (visible boot, sampled through three's mixer) ---
const dir=new URL('../assets/players/',import.meta.url);
async function load(file){
 const g=JSON.parse(readFileSync(new URL(file,dir),'utf8'));
 g.buffers=g.buffers.map(b=>({...b,uri:'data:application/octet-stream;base64,'+readFileSync(new URL(b.uri,dir)).toString('base64')}));
 delete g.images;delete g.textures;delete g.samplers;
 for(const m of g.materials||[]){if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
 return {json:g,gltf:await new Promise((ok,no)=>new GLTFLoader().parse(JSON.stringify(g),'',ok,no))};
}
// Boot sole points as the game renders them: the visible boot weighted to foot.L is the mirror of the
// joint (see scripts/player-avatar/author_gait.mjs) and moves with the joint's world motion.
function soles(scene){
 let mesh;scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o});
 const P=mesh.geometry.attributes.position,J=mesh.geometry.attributes.skinIndex,W=mesh.geometry.attributes.skinWeight,bones=mesh.skeleton.bones,out=[];
 for(const name of ['footL','footR']){const bi=bones.findIndex(b=>b.name===name),pts=[];
  for(let i=0;i<P.count;i++){let w=0;for(let k=0;k<4;k++)if(J.getComponent(i,k)===bi)w+=W.getComponent(i,k);if(w>.5)pts.push(new THREE.Vector3().fromBufferAttribute(P,i).setX(-P.getX(i)));}
  const minY=Math.min(...pts.map(p=>p.y)),sole=pts.filter(p=>p.y<minY+.02);
  const zs=sole.map(p=>p.z),x=sole.reduce((s,p)=>s+p.x,0)/sole.length;
  out.push({bone:bones[bi],rest:bones[bi].matrixWorld.clone().invert(),ground:minY,pts:[Math.min(...zs)+.015,(Math.min(...zs)+Math.max(...zs))/2,Math.max(...zs)-.01].map(z=>new THREE.Vector3(x,minY,z))});}
 return out;
}
for(const file of ['gas-mask-guy.gltf','gas-mask-guy-lod.gltf','gas-mask-guy-body.gltf']){
 const {json,gltf}=await load(file);
 const clips=Object.fromEntries(gltf.animations.map(c=>[c.name,c]));
 for(const n of ['Idle','Walk','Run','Sprint','Air','Jump','Sit','Ride'])assert(clips[n]?.duration>.3,`${file} has a ${n} clip`);
 for(const n of ['Walk','Run','Sprint']){
  const a=json.animations.find(x=>x.name===n);
  assert(a.samplers.filter(s=>s.interpolation==='CUBICSPLINE').length>=17,`${file} ${n} uses smooth cubic keys, not LINEAR`);
  assert(Math.abs(a.extras.stride-GAIT_CLIPS[n].stride)<1e-6,`${file} ${n} stride matches player-gait.mjs`);
  assert(Math.abs(clips[n].duration-GAIT_CLIPS[n].duration)<1e-3,`${file} ${n} duration matches player-gait.mjs`);
 }
 if(file!=='gas-mask-guy.gltf'){
  // LOD / first-person body carry the very same authored clips, so a LOD swap never changes the step.
  const main=JSON.parse(readFileSync(new URL('gas-mask-guy.gltf',dir),'utf8'));
  for(const n of ['Walk','Run','Sprint','Air'])assert.deepEqual(json.animations.find(x=>x.name===n).channels.map(c=>[json.nodes[c.target.node].name,c.target.path]),main.animations.find(x=>x.name===n).channels.map(c=>[main.nodes[c.target.node].name,c.target.path]),`${file} ${n} matches the full model`);
  for(const n of ['Walk','Run','Sprint']){const a=clips[n].tracks.map(t=>t.values.length).join(),b=(await load('gas-mask-guy.gltf')).gltf.animations.find(c=>c.name===n).tracks.map(t=>t.values.length).join();assert.equal(a,b,`${file} ${n} has the same keys`);}
  continue;
 }
 const scene=clone(gltf.scene);scene.updateMatrixWorld(true);
 const feet=soles(scene),mixer=new THREE.AnimationMixer(scene),v=new THREE.Vector3();
 for(const n of ['Walk','Run','Sprint']){
  const clip=clips[n],act=mixer.clipAction(clip).play(),N=120,rows=[];
  for(let i=0;i<=N;i++){mixer.setTime(clip.duration*i/N);scene.updateMatrixWorld(true);
   const travel=GAIT_CLIPS[n].stride*i/N;
   rows.push(feet.map(f=>{const m=f.bone.matrixWorld.clone().multiply(f.rest);return f.pts.map(p=>{v.copy(p).applyMatrix4(m);return {y:v.y-f.ground,x:v.x,z:v.z+travel}})}));}
  let slip=0,planted=0,air=0,worst=0;
  for(let i=0;i<N;i++){let down=0;for(let f=0;f<2;f++){let step=0,on=false;for(let c=0;c<3;c++){const a=rows[i][f][c],b=rows[i+1][f][c];if(a.y<.005&&b.y<.005){on=true;step=Math.max(step,Math.hypot(b.x-a.x,b.z-a.z));}}if(on){down++;slip+=step;planted+=GAIT_CLIPS[n].stride/N;worst=Math.max(worst,step);}}if(!down)air++;}
  const ratio=slip/planted;
  console.log(`${file} ${n}: planted-boot slip ${(ratio*100).toFixed(2)}% of body travel, worst ${(worst*1000).toFixed(1)} mm per 1/120 cycle, flight ${(air/N*100).toFixed(0)}%`);
  assert(ratio<.03,`${file} ${n} planted boot slides ${(ratio*100).toFixed(1)}% (must be < 3%)`);
  if(n==='Walk')assert.equal(air,0,'walking always has a foot down');
  else assert(air/N>.15,`${n} has a flight phase`);
  act.stop();
 }
 mixer.stopAllAction();
}

// --- wiring ---
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const walker=readFileSync(new URL('./walker.js',import.meta.url),'utf8');
const ph=readFileSync(new URL('./nft-avatar-placeholder.js',import.meta.url),'utf8');
const dpa=readFileSync(new URL('./default-player-avatar.mjs',import.meta.url),'utf8');
assert.equal((app.match(/poseWalker\(avatar,/g)||[]).length,1,'the local walker is posed only through poseMe');
assert((app.match(/\bposeMe\(dt,/g)||[]).length>=3,'city, Estates island and home interiors all pose the local player');
assert(/function poseMe[^]*?L\.nftCharacter&&L\.nftCharacter\.userData\.anim\)L\.nftCharacter\.userData\.anim\(t,amp>\.05,!!P\.climb,run,L\.groundSpeed,up\)/.test(app),'NFT holders animate on every path with speed + airborne');
assert(/defaultAvatar\?\.update\([^;]*,\s*speed\)/.test(walker),'poseWalker forwards ground speed to the mixer');
assert(/air \? 'Air'/.test(walker),'poseWalker plays Air while airborne');
assert(!/locomotionTimeScale|timeScale = locomotion/.test(dpa),'no clamped timeScale: phase is driven by distance');
assert(/\.reset\(\)/.test(dpa)===false,'gait switches never reset() the cycle');
assert(/poseWalker\(walker,t\*9,moving\?1:0,t,!!running,speed,!!air\)/.test(ph),'NFT placeholder forwards running + speed + air');
assert(/Number\.isFinite\(dt\)/.test(dpa),'mixer ignores NaN frame times');
assert(!/mixamo/i.test(dpa),'no Mixamo assets');
const hf=readFileSync(new URL('../arena/homefront.html',import.meta.url),'utf8');
assert(/poseWalker\(yardAvatar\.userData\.walker,yardMotion\.phase,yardMotion\.amp,performance\.now\(\)\/1000,!!yardRun,yardAvatar\.userData\.groundSpeed,yardAir\)/.test(hf),'Homefront yard passes real speed, run and airborne');
const city=readFileSync(new URL('./city.js',import.meta.url),'utf8');
assert(/const k=1-Math\.exp\(-ldt\*/.test(city),'remote peers smooth by time, not per frame');
assert(/1-Math\.exp\(-dt\/\.1\)/.test(city),'remote peer speed smoothing is dt-based');
console.log('Player walk sync: distance-driven Walk/Run/Sprint blend, planted feet, Air pose, NaN-safe mixer, all paths animate NFT holders');
