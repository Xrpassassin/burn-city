// Original Zombies architectural decay: actual broken overhead panels, exposed
// copper conduit, sagging wiring, window glass remnants and sparse dust.
// Visual only. Reuses the repo's licensed CC0 Poly Haven concrete scan;
// NEVER alters zombie LOS, breakable boards, doors, collisions or map topology.
import * as THREE from './vendor/three.module.min.js';
import {planZombiesRuinedArchitecture} from './zombies-ruined-architecture-plan.mjs';

let sharedConcreteScan=null;
function concreteScan(){
 if(typeof document==='undefined')return null;
 if(!sharedConcreteScan){
  sharedConcreteScan=new THREE.TextureLoader().load(
   new URL('./assets/homefront/surfaces/concrete_wall_006-color.webp',import.meta.url).href,
   undefined,undefined,()=>{sharedConcreteScan.userData.failed=true;});
  sharedConcreteScan.wrapS=sharedConcreteScan.wrapT=THREE.RepeatWrapping;
  sharedConcreteScan.colorSpace=THREE.SRGBColorSpace;
  sharedConcreteScan.anisotropy=2;
  sharedConcreteScan.userData.license='CC0-1.0 / Poly Haven Concrete Wall 006';
 }
 return sharedConcreteScan.userData.failed?null:sharedConcreteScan;
}

function chippedSlabGeometry(){
 // Irregular 7-sided concrete fragment: cracks read in silhouette, even
 // from a distance. The gap between twin plates exposes the dark sky above.
 const xz=[[-.5,-.5],[.38,-.5],[.48,-.26],[.23,-.06],[.44,.44],
  [-.24,.5],[-.44,.19]];
 const verts=[],uvs=[];
 for(let i=1;i<xz.length-1;i++)for(const n of [0,i,i+1]){
  const [x,z]=xz[n];
  verts.push(x,0,z);uvs.push(x+.5,z+.5);
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
 geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 geo.computeVertexNormals();
 return geo;
}
function shatteredGlassGeometry(){
 // Only the broken upper corners of real openings survive: the zombie
 // window lane and its original repairable barricades remain unobstructed.
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute([
   -.42,0,0, .38,0,0, -.18,-.52,0,
   .38,0,0, .16,-.19,0, -.18,-.52,0],3));
 geo.computeVertexNormals();
 return geo;
}

export function addZombiesRuinedArchitecture(root,layout,{
 low=false,g=x=>x,
 basic=(c,o={})=>new THREE.MeshBasicMaterial({color:c,...o})
}={}){
 const plan=planZombiesRuinedArchitecture(layout,{low});
 const parts={beam:[],slab:[],pipe:[],cable:[],glass:[]};
 const push=(family,site,dx,y,dz,sx,sy,sz,color,rotation=0)=>{
  parts[family].push({site,dx,y,dz,sx,sy,sz,color,rotation});
 };
 for(const s of plan.clusters){
  const warm=s.kind==='furnace',cold=s.kind==='isolation';
  const metal=warm?0x70584b:cold?0x68757a:0x655d55;
  const slabColor=warm?0x918378:cold?0x7f8986:0x8a8176;
  // Wall-bolted cross-beam and two ruined ceiling ribs. All overhead:
  // baseline 3.2m, above the game's character and head-hit volumes.
  push('beam',s,0,3.25,.20,1.92,.13,.18,metal);
  for(const xx of [-.79,.79]){
   push('beam',s,xx,3.22,1.24,.13,.17,2.46,metal);
   if(s.damage!==2)push('beam',s,xx,3.29,2.28,.17,.10,.18,0x342e2d);
  }
  // Only partial, jagged concrete remains; never seal rooms with full opaque
  // roofs or create anything at player height.
  push('slab',s,-.40,3.28,1.06,1.20,1,1.58,slabColor);
  if(s.damage!==1)push('slab',s,.44,3.27,1.25,1.06,1,1.31,slabColor);
  if(s.kind==='power'||s.kind==='furnace'){
   for(const xx of [-.46,.46])
    push('pipe',s,xx,3.09,1.14,1,1,2.26,warm?0x786250:0x657773);
  }else if(s.kind==='isolation'){
   push('pipe',s,0,3.12,1.07,1,1,2.1,0x6d8083);
  }
  // Shared prefab-like sag geometry, tiny radius, deliberately above eye
  // height. Phone version retains one short cable per alternate room.
  if(!low||s.zone%2===0)
   push('cable',s,(s.hash%2?.35:-.32),3.16,.27,1,1,1.0,
    cold?0x647a80:0x362d27);
 }
 for(const w of plan.windows){
  const ax=w.ax==='x';
  for(const side of [-1,1]){
   const half=.52*side;
   const p={yaw:ax?0:Math.PI/2,x:w.x,z:w.z};
   // A narrow top shard, not a continuous glass sheet across the window.
   push('glass',p,half,w.y,0,.65,.68,1,
    (w.index+side)%3===0?0x8fa3a8:0x9eb2b7,
    side<0?0:Math.PI);
  }
 }
 const definitions={
  beam:()=>[new THREE.BoxGeometry(1,1,1),basic(0xffffff)],
  slab:()=>[chippedSlabGeometry(),basic(0xffffff,
    {map:concreteScan(),side:THREE.DoubleSide})],
  pipe:()=>[new THREE.CylinderGeometry(.045,.045,1,7).rotateX(Math.PI/2),
    basic(0xffffff)],
  cable:()=>[new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0),new THREE.Vector3(.13,-.17,.32),
    new THREE.Vector3(-.10,-.55,.68),new THREE.Vector3(.08,-.30,1.14)
   ]),12,.027,4,false),basic(0xffffff)],
  glass:()=>[shatteredGlassGeometry(),basic(0xffffff,
    {transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide})]
 };
 const pos=new THREE.Vector3(),sc=new THREE.Vector3(),q=new THREE.Quaternion();
 const ry=new THREE.Quaternion(),rz=new THREE.Quaternion();
 const axisY=new THREE.Vector3(0,1,0);
 const axisZ=new THREE.Vector3(0,0,1);
 const matrix=new THREE.Matrix4();
 let draws=0,instances=0;
 for(const [family,array] of Object.entries(parts)){
  if(!array.length)continue;
  const [geometry,material]=definitions[family]();
  const mesh=new THREE.InstancedMesh(g(geometry),material,array.length);
  mesh.name='zombies-ruins-'+family;
  mesh.userData.cosmeticOnly=true;
  mesh.userData.overheadOnly=family!=='glass';
  for(let i=0;i<array.length;i++){
   const t=array[i],a=t.site.yaw;
   const x=t.site.x+t.dx*Math.cos(a)+t.dz*Math.sin(a);
   const z=t.site.z-t.dx*Math.sin(a)+t.dz*Math.cos(a);
   pos.set(x,t.y,z);sc.set(t.sx,t.sy,t.sz);
   ry.setFromAxisAngle(axisY,a);
   if(t.rotation)rz.setFromAxisAngle(axisZ,t.rotation),q.copy(ry).multiply(rz);
   else q.copy(ry);
   mesh.setMatrixAt(i,matrix.compose(pos,q,sc));
   mesh.setColorAt(i,new THREE.Color(t.color));
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.computeBoundingSphere();
  root.add(mesh);draws++;instances+=array.length;
 }
 // Only a few drifting particulate motes near damaged roof panels, never a
 // per-particle mesh or artificial gameplay fog that obscures enemy targets.
 const motes=[];
 for(const s of plan.clusters){
  for(let k=0;k<(low?3:10);k++){
   const hash=(Math.imul(s.hash^(k*7127),1664525)+1013904223)>>>0;
   const dx=((hash&255)/255-.5)*2.5,dz=(((hash>>>8)&255)/255)*2.4;
   const a=s.yaw;
   motes.push(s.x+dx*Math.cos(a)+dz*Math.sin(a),
    1.4+(((hash>>>16)&255)/255)*1.65,
    s.z-dx*Math.sin(a)+dz*Math.cos(a));
  }
 }
 let dustMaterial=null;
 if(motes.length){
  const geo=g(new THREE.BufferGeometry());
  geo.setAttribute('position',new THREE.Float32BufferAttribute(motes,3));
  dustMaterial=new THREE.PointsMaterial({size:low?.052:.075,
   color:0xa9a194,transparent:true,opacity:low?.24:.34,
   depthWrite:false,fog:true});
  const dust=new THREE.Points(geo,dustMaterial);
  dust.name='zombies-ruins-local-dust';
  dust.userData.cosmeticOnly=true;
  root.add(dust);draws++;
 }
 return {clusters:plan.clusters,windows:plan.windows,drawCalls:draws,
  instances,motes:motes.length/3,source:'CC0 scanned concrete + original geometry',
  dispose(){dustMaterial?.dispose();}};
}
