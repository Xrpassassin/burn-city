// Mortuus-style street dressing for the original Zombies maps: instanced Kenney
// CC0 props (wrecked cars, fences, barricades, debris, flicker lights) plus
// procedural ground stains. Cosmetic only — no collision, LOS or gameplay state.
import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {planZombiesWreckage} from './zombies-wreckage-plan.mjs';

const BASE=new URL('./assets/env/',import.meta.url);
const MODELS={
 sedan:'kenney-sedan.glb',taxi:'kenney-taxi.glb',van:'kenney-van.glb',
 'wood-fence':'kenney-wood-fence.glb','wood-fence-fortified':'kenney-wood-fence-fortified.glb',
 'iron-fence-damaged':'kenney-iron-fence-damaged.glb','grave-fence-damaged':'kenney-grave-fence-damaged.glb',
 'work-fence':'kenney-work-fence.glb',barrier:'kenney-barrier.glb',cone:'kenney-cone.glb',
 barrel:'kenney-barrel.glb',crate:'kenney-crate.glb','crate-large':'kenney-crate-large.glb',
 dumpster:'kenney-dumpster.glb',rubble:'kenney-rubble.glb','debris-tire':'kenney-debris-tire.glb',
 'debris-bumper':'kenney-debris-bumper.glb','debris-door':'kenney-debris-door.glb',
 lightpost:'kenney-lightpost.glb','work-light':'kenney-work-light.glb'
};
const TARGET={
 sedan:4.4,taxi:4.4,van:4.8,'wood-fence':2.05,'wood-fence-fortified':2.05,
 'iron-fence-damaged':2.1,'grave-fence-damaged':2.1,'work-fence':2.15,barrier:2.0,
 cone:0.8,barrel:0.95,crate:0.85,'crate-large':1.15,dumpster:2.2,rubble:1.5,
 'debris-tire':0.9,'debris-bumper':1.15,'debris-door':1.2,lightpost:4.4,'work-light':2.3
};
const AXIS={
 sedan:'x',taxi:'x',van:'x','wood-fence':'x','wood-fence-fortified':'x',
 'iron-fence-damaged':'x','grave-fence-damaged':'x','work-fence':'x',barrier:'x',
 cone:'y',barrel:'y',crate:'y','crate-large':'y',dumpster:'x',rubble:'x',
 'debris-tire':'x','debris-bumper':'x','debris-door':'y',lightpost:'y','work-light':'y'
};
const TINT=[0xb9a090,0x8a6a55,0x6e5a48,0x9a8870,0x7a624c,0x5c5348,0xa07850];

const cache=new Map();
let loader=null;
function loadModel(name){
 if(cache.has(name))return cache.get(name);
 const file=MODELS[name];
 if(!file)return Promise.resolve(null);
 const p=(loader||(loader=new GLTFLoader())).loadAsync(new URL(file,BASE).href)
  .then(gltf=>{
   gltf.scene.updateMatrixWorld(true);
   const parts=[];
   gltf.scene.traverse(o=>{
    if(!o.isMesh||!o.geometry)return;
    const geo=o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    if(!geo.attributes.normal)geo.computeVertexNormals();
    const map=o.material&&(o.material.map||o.material.emissiveMap)||null;
    parts.push({geo,map});
   });
   if(!parts.length)return null;
   let geo=parts[0].geo, map=parts[0].map;
   if(parts.length>1){
    const merged=mergeGeometries(parts.map(p=>p.geo),false);
    if(merged)geo=merged;
    else {
     for(const part of parts)if((part.geo.attributes.position?.count||0)>(geo.attributes.position?.count||0)){geo=part.geo;map=part.map;}
    }
   }
   const box=new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
   const size=new THREE.Vector3();box.getSize(size);
   const center=new THREE.Vector3();box.getCenter(center);
   geo.translate(-center.x,-box.min.y,-center.z);
   return {geo,map,size:size.clone(),height:size.y};
  })
  .catch(()=>null);
 cache.set(name,p);
 return p;
}

function canvasTex(w,h,draw){
 const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
}

export function addZombiesWreckage(root,layout,{low=false,g=x=>x,basic=(c,o)=>new THREE.MeshBasicMaterial({color:c,...o})}={}){
 const plan=planZombiesWreckage(layout,{low});
 const group=new THREE.Group();group.name='zombies-wreckage';root.add(group);
 const mats=[],geos=[],meshes=[];
 let disposed=false,t=0;

 // Ground oil / blood / ash: one transparent mesh, no downloads.
 if(plan.stains.length){
  const atlas=canvasTex(192,64,(x)=>{
   const blot=(ox,col,n,rr)=>{for(let i=0;i<n;i++){const a=Math.random()*6.28,d=Math.random()*20;
    x.fillStyle=col;x.globalAlpha=0.22+Math.random()*0.5;x.beginPath();x.arc(ox+32+Math.cos(a)*d,32+Math.sin(a)*d,2+Math.random()*rr,0,6.28);x.fill();}x.globalAlpha=1;};
   blot(0,'#2a0808',36,8);blot(0,'#140303',12,4);
   const og=x.createRadialGradient(96,32,2,96,32,28);og.addColorStop(0,'rgba(8,8,6,.95)');og.addColorStop(.55,'rgba(20,16,8,.55)');og.addColorStop(1,'rgba(0,0,0,0)');
   x.fillStyle=og;x.fillRect(64,0,64,64);
   blot(128,'#1a1208',28,7);x.fillStyle='rgba(50,40,20,.2)';x.beginPath();x.arc(160,30,9,0,6.28);x.fill();
  });
  const dp=[],du=[];
  const quad=(p,u)=>{for(const i of [0,1,2,0,2,3]){dp.push(...p[i]);du.push(...u[i]);}};
  for(const s of plan.stains){
   const ca=Math.cos(s.yaw),sa=Math.sin(s.yaw),k=s.k,sz=s.s;
   const P=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[s.x+(u*ca-v*sa)*sz,0.025+k*0.002,s.z+(u*sa+v*ca)*sz]);
   quad(P,[[k/3,0],[(k+1)/3,0],[(k+1)/3,1],[k/3,1]]);
  }
  const dg=g(new THREE.BufferGeometry());
  dg.setAttribute('position',new THREE.Float32BufferAttribute(dp,3));
  dg.setAttribute('uv',new THREE.Float32BufferAttribute(du,2));
  const dm=basic(0xffffff,{map:atlas,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  const stainMesh=new THREE.Mesh(dg,dm);stainMesh.renderOrder=1;group.add(stainMesh);
  mats.push(dm);geos.push(dg);
 }

 // Additive flicker pools under lamp sites (works even before GLBs land).
 const glowTex=canvasTex(64,64,(x)=>{
  const gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,210,140,1)');gr.addColorStop(.3,'rgba(255,140,50,.5)');gr.addColorStop(1,'rgba(255,80,20,0)');
  x.fillStyle=gr;x.fillRect(0,0,64,64);
 });
 const glowMats=[];
 for(const lamp of plan.lamps){
  const h=lamp.model==='lightpost'?3.6:2.1,s=low?1.6:2.4;
  const mat=basic(0xffc090,{map:glowTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0.42});
  const bulb=new THREE.Mesh(g(new THREE.PlaneGeometry(0.7,0.7)),mat);
  bulb.position.set(lamp.x,h,lamp.z);bulb.userData.flicker=lamp.flicker||0.5;
  const pool=new THREE.Mesh(g(new THREE.PlaneGeometry(s*2,s*2)),mat);
  pool.rotation.x=-Math.PI/2;pool.position.set(lamp.x,0.04,lamp.z);pool.userData.flicker=lamp.flicker||0.5;
  group.add(bulb,pool);glowMats.push(mat);mats.push(mat);
 }

 const needed=[...new Set(plan.sites.map(s=>s.model).filter(m=>MODELS[m]))];
 const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),V=new THREE.Vector3(),S=new THREE.Vector3(),C=new THREE.Color();

 Promise.all(needed.map(name=>loadModel(name).then(data=>[name,data]))).then(entries=>{
  if(disposed)return;
  const ready=new Map(entries.filter(([,d])=>d&&d.geo));
  const byModel=new Map();
  for(const site of plan.sites){
   if(!ready.has(site.model))continue;
   if(!byModel.has(site.model))byModel.set(site.model,[]);
   byModel.get(site.model).push(site);
  }
  for(const [name,list] of byModel){
   const src=ready.get(name);
   const geo=g(src.geo.clone());
   const mat=basic(0xffffff,{map:src.map||null});
   mat.vertexColors=false;
   const mesh=new THREE.InstancedMesh(geo,mat,list.length);
   mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
   const target=TARGET[name]||2,axis=AXIS[name]||'x';
   const sx0=axis==='y'?(src.size?.y||target):(axis==='z'?(src.size?.z||target):(src.size?.x||target));
   const sc=sx0>0.01?target/sx0:1;
   list.forEach((site,i)=>{
    const tilt=site.tilt||0,roll=site.roll||0;
    E.set(tilt,site.yaw||0,roll,'YXZ');
    Q.setFromEuler(E);
    const sink=name==='sedan'||name==='taxi'||name==='van'?-0.05:0;
    M.compose(V.set(site.x,sink,site.z),Q,S.set(sc,sc,sc));
    mesh.setMatrixAt(i,M);
    if(mesh.setColorAt){
     const rust=TINT[(site.tint??site.hash??i)%TINT.length];
     const dim=site.kind==='car'?0.72:0.9;
     mesh.setColorAt(i,C.setHex(rust).multiplyScalar(dim));
    }
   });
   mesh.instanceMatrix.needsUpdate=true;
   if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   group.add(mesh);meshes.push(mesh);mats.push(mat);
  }
 }).catch(()=>{});

 return {
  sites:plan.sites,stains:plan.stains,lamps:plan.lamps,
  get instances(){return meshes.reduce((n,m)=>n+m.count,0);},
  get drawCalls(){return meshes.length+(plan.stains.length?1:0)+(plan.lamps.length?1:0);},
  update(dt){
   t+=dt;
   for(const mat of glowMats){
    const flicker=mat.userData?.flicker||0.5;
    // Shared material: a slow hum plus the odd brown-out, quiet and cheap.
    mat.opacity=0.28+0.1*Math.sin(t*2.05)+((Math.sin(t*17.3+flicker*9)>0.92)?-0.2:0);
   }
   // Per-bulb flicker: the meshes share a material, so vary pool scale slightly.
   group.traverse(o=>{
    if(!o.userData?.flicker||!o.isMesh)return;
    if(o.rotation.x<-1)return; // floor pools stay put; bulbs face the camera
    o.quaternion.copy(root.parent?.userData?.camQ||o.quaternion);
    const k=o.userData.flicker;
    o.material.opacity=0.32+0.14*Math.sin(t*(2.2+k)+k*8)+((Math.sin(t*(21+k*6)+k)>0.9)?-0.22:0);
   });
  },
  dispose(){
   disposed=true;
   root.remove(group);
   group.traverse(o=>{
    if(o.isMesh){
     if(o.geometry&&!geos.includes(o.geometry)){/* instanced geos are in g() pool */}
    }
   });
  }
 };
}
