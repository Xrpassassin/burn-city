import {estateSurfaceProperties,disposeEstateSurfaceMaterial} from './estates-material-fidelity.mjs';
// Architecturally grounded shared-island estate decorations.
// Every detail comes from the server-verified unlock list, not local wallet state.
// Authenticated interiors remain behind the separate private-room scene.
import {estateUpgradeExteriorParts,estateUpgradeModelSlots,ESTATE_EXTERIOR_ITEM_IDS} from './estates-tycoon-architecture.mjs';
const COLORS=Object.freeze({
 stone:0x91897d,wood:0x78604b,metal:0x596970,brass:0xbba16d,
 slate:0x35444e,glass:0x86b4bd,warm:0xffc782,green:0x567e4b,flower:0xd98795,
 gold:0xc6a663,earth:0x493728,red:0xa74731,water:0x3a8193,violet:0x8f6cc9,
 ember:0xff6a2b,flame:0xffa040,neon:0xff4fa3,neonCyan:0x4fe3ff,alert:0xff3b30,glow:0xffc070
});
// Self-lit materials stay readable at dusk without real-time lights (no extra
// shader cost per light on mobile). Values are emissive intensities.
const EMISSIVE=Object.freeze({warm:1.35,ember:1.6,flame:2.2,neon:1.8,neonCyan:1.8,alert:1.6});
const INSTALL_SECONDS=.75,SPARKLE_SECONDS=1.6,SPARKLE_COUNT=18;
const easeOutBack=t=>{const c=1.4;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);};
const known=new Set(ESTATE_EXTERIOR_ITEM_IDS);
export function createEstateTycoonDecor({THREE,parent,lots,models=null}={}){
 if(!THREE?.Group||!THREE?.Mesh||!THREE?.BoxGeometry||!THREE?.MeshStandardMaterial||!parent?.add||!Array.isArray(lots))
  throw TypeError('tycoon_decoration_dependencies_required');
 const root=new THREE.Group();root.name='estate-tycoon-verified-decorations';parent.add(root);
 // Preview is an entirely separate local-only scene layer. Never add preview IDs
 // to the verified server-backed upgrade list or public ownership state.
 const previewRoot=new THREE.Group();previewRoot.name='estate-tycoon-preview-only';parent.add(previewRoot);
 const lotById=new Map(lots.filter(l=>l.propertyId).map(l=>[l.propertyId,l]));
 let lastKey='',disposed=false,lastMapped=null,installAnim=null,lastProperties=[];
 let loadedModels=models instanceof Map?models:new Map();
 const materials=new Map();
 const material=key=>{
  if(materials.has(key))return materials.get(key);
  let mat;
  if(key==='glow'||key==='sparkle'){
   // Soft additive halo / install sparkle: no depth write, unlit.
   const Basic=THREE.MeshBasicMaterial||THREE.MeshStandardMaterial;
   mat=new Basic({color:key==='glow'?COLORS.glow:0xffe39a,transparent:true,opacity:key==='glow'?.24:.95,depthWrite:false,
    ...(THREE.AdditiveBlending!==undefined?{blending:THREE.AdditiveBlending}:{})});
  }else mat=new THREE.MeshStandardMaterial({
   color:COLORS[key]??COLORS.stone,roughness:key==='water'?.12:key==='glass'?.22:key==='metal'?.39:key==='brass'?.35:key==='wood'?.78:.89,
   metalness:key==='metal'?.72:key==='brass'?.62:key==='slate'?.26:key==='water'?.1:0,
   ...(EMISSIVE[key]?{emissive:COLORS[key],emissiveIntensity:EMISSIVE[key]}:{}),
   ...(key==='water'?{transparent:true,opacity:.86}:{} ),
   ...estateSurfaceProperties(THREE,key)
  });
  materials.set(key,mat);
  return mat;
 };
 // Primitive selection is immutable and tied to server-verified, measured parts.
 // Round lenses, bollards and flower blossoms need not remain cubic. Unsupported
 // test/lightweight Three namespaces fall back to original boxes.
 const partGeometry=(part,unit=false)=>{
  const w=unit?1:part.w,h=unit?1:part.h,d=unit?1:part.d;
  if(part.shape==='cylinder'&&THREE.CylinderGeometry){
   const geom=new THREE.CylinderGeometry(w/2,w/2,h,12);
   geom.scale?.(1,1,d/w);
   return geom;
  }
  if(part.shape==='cone'&&(THREE.ConeGeometry||THREE.CylinderGeometry)){
   const geom=THREE.ConeGeometry?new THREE.ConeGeometry(w/2,h,10):new THREE.CylinderGeometry(0,w/2,h,10);
   geom.scale?.(1,1,d/w);
   return geom;
  }
  if(part.shape==='sphere'&&THREE.SphereGeometry){
   const geom=new THREE.SphereGeometry(w/2,10,7);
   geom.scale?.(1,h/w,d/w);
   return geom;
  }
  return new THREE.BoxGeometry(w,h,d);
 };
 const box=(group,part)=>{
  const mesh=new THREE.Mesh(partGeometry(part),material(part.mat));
  mesh.name=part.name;mesh.userData={estateUpgradeId:part.id,placement:part.placement};
  mesh.position.set(part.x,part.y,part.z);group.add(mesh);
 };
 function clear(){
  const geometries=new Set();
  root.traverse?.(obj=>{if(obj.geometry&&!obj.userData?.sharedModel)geometries.add(obj.geometry);});
  for(const geom of geometries)geom.dispose?.();
  for(const mat of materials.values())disposeEstateSurfaceMaterial(mat);
  materials.clear();
  for(const child of [...root.children])root.remove(child);
  installAnim=null;
 }
 function clearUpgradePreview(){
  const geometries=new Set(),mats=new Set();
  previewRoot.traverse?.(obj=>{
   if(obj.geometry)geometries.add(obj.geometry);
   if(obj.material)for(const mat of (Array.isArray(obj.material)?obj.material:[obj.material]))mats.add(mat);
  });
  for(const geometry of geometries)geometry.dispose?.();
  for(const mat of mats)mat.dispose?.();
  for(const child of [...previewRoot.children])previewRoot.remove(child);
  return true;
 }
 function previewUpgrade(propertyId,itemId){
  if(disposed)return false;
  clearUpgradePreview();
  if(itemId===null)return true;
  if(!lotById.has(propertyId)||!known.has(itemId))return false;
  const lot=lotById.get(propertyId),group=new THREE.Group();
  group.name='preview-only-'+propertyId+'-'+itemId;
  group.position.set(lot.position.x,lot.position.y,lot.position.z);
  for(const part of estateUpgradeExteriorParts(lot,[itemId])){
   const mesh=new THREE.Mesh(partGeometry(part),
    new THREE.MeshStandardMaterial({color:0x6ee7e9,emissive:0x136b80,emissiveIntensity:.24,
      roughness:.65,transparent:true,opacity:.48,depthWrite:false}));
   mesh.name='preview-only-'+part.name;
   mesh.userData={previewOnly:true,notPurchased:true,estateUpgradeId:part.id};
   mesh.position.set(part.x,part.y,part.z);group.add(mesh);
  }
  previewRoot.add(group);
  return true;
 }
 function setUpgrades(properties=[]){
  if(disposed)return false;
  const mapped=new Map();
  for(const item of properties){
   if(!lotById.has(item?.propertyId)||!Array.isArray(item.unlockedItemIds))continue;
   const ids=[...new Set(item.unlockedItemIds.filter(id=>typeof id==='string'&&known.has(id)))].sort();
   mapped.set(item.propertyId,ids);
  }
  const key=[...lotById.keys()].map(id=>id+':'+(mapped.get(id)||[]).join(',')).join('|');
  if(key===lastKey)return false;
  // Only purchases that arrive after the first verified load animate; a fresh
  // page load shows everything already installed.
  const fresh=new Set();
  if(lastMapped)for(const [id,items]of mapped){
   const before=new Set(lastMapped.get(id)||[]);
   for(const item of items)if(!before.has(item))fresh.add(id+'|'+item);
  }
  clear();lastKey=key;if(mapped.size||lastMapped)lastMapped=mapped;lastProperties=properties;
  const upgrades=[],modelled=[];
  const useModels=THREE.InstancedMesh&&THREE.Object3D&&loadedModels.size;
  for(const [id,items]of mapped){
   if(!items.length)continue;
   const lot=lotById.get(id),hidden=new Set();
   if(useModels)for(const slot of estateUpgradeModelSlots(lot,items)){
    const model=loadedModels.get(slot.model),prims=model?.parts.get(slot.part);
    if(!prims?.length)continue;
    for(const name of slot.replaces)hidden.add(name);
    modelled.push({lot,slot,prims});
   }
   for(const part of estateUpgradeExteriorParts(lot,items))if(!hidden.has(part.name))upgrades.push({lot,part});
  }
  // Real Three.js can render hundreds of verified facade/yard details in just
  // a few material-batched draw calls. Preserve named meshes for lightweight
  // renderers and unit test doubles that lack InstancedMesh support.
  if(THREE.InstancedMesh&&THREE.Object3D){
   const buckets=new Map();
   for(const upgrade of upgrades){
    const key=upgrade.part.mat+'|'+(upgrade.part.shape||'box');
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(upgrade);
   }
   const transform=new THREE.Object3D(),growing=[],sparkLots=new Set();
   for(const [key,entries]of buckets){
    const [name,shape]=key.split('|');
    const mesh=new THREE.InstancedMesh(partGeometry({shape},true),material(name),entries.length);
    mesh.name='estates-upgrades-instanced-'+name+'-'+shape;
    mesh.userData={verifiedUpgrades:true,visibleParts:entries.length};
    entries.forEach(({lot,part},i)=>{
     const isFresh=fresh.has(lot.propertyId+'|'+part.id);
     if(isFresh){growing.push({mesh,i,x:lot.position.x+part.x,y0:lot.position.y,dy:part.y,z:lot.position.z+part.z,sx:part.w,sy:part.h,sz:part.d,ry:0});sparkLots.add(lot);}
     const k=isFresh?.001:1;
     transform.position.set(lot.position.x+part.x,lot.position.y+part.y,lot.position.z+part.z);
     transform.rotation.set(0,0,0);transform.scale.set(part.w*k,part.h*k,part.d*k);
     transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere?.();root.add(mesh);
   }
   // Authored models: one InstancedMesh per (model part, primitive) shared by
   // every lot, each instance fitted inside its slot box and grounded.
   const modelBuckets=new Map();
   for(const entry of modelled){
    const key=entry.slot.model+'|'+entry.slot.part;
    if(!modelBuckets.has(key))modelBuckets.set(key,[]);
    modelBuckets.get(key).push(entry);
   }
   for(const [key,entries]of modelBuckets){
    const prims=entries[0].prims,box=new THREE.Box3();
    for(const {geometry}of prims){geometry.computeBoundingBox();box.union(geometry.boundingBox);}
    const size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
    const fits=entries.map(({lot,slot})=>{
     // Slot boxes are world-aligned: a quarter-turned model swaps its x/z fit.
     const turned=Math.abs(Math.sin(slot.ry))>.7,sw=turned?slot.d:slot.w,sd=turned?slot.w:slot.d;
     let sx=sw/size.x,sy=slot.h/size.y,sz=sd/size.z;
     if(!slot.stretch)sx=sy=sz=Math.min(sx,sy,sz);
     const c=Math.cos(slot.ry),s=Math.sin(slot.ry),ox=centre.x*sx,oz=centre.z*sz;
     return {lot,slot,sx,sy,sz,x:lot.position.x+slot.x-(ox*c+oz*s),y:lot.position.y+slot.y-box.min.y*sy,z:lot.position.z+slot.z-(-ox*s+oz*c)};
    });
    prims.forEach(({geometry,material:mat},n)=>{
     const mesh=new THREE.InstancedMesh(geometry,mat,fits.length);
     mesh.name='estates-upgrades-model-'+key.replace('|','-')+'-'+n;
     mesh.userData={verifiedUpgrades:true,visibleParts:fits.length,sharedModel:true};
     fits.forEach((f,i)=>{
      const isFresh=fresh.has(f.lot.propertyId+'|'+f.slot.id);
      if(isFresh){growing.push({mesh,i,x:f.x,y0:f.y,dy:0,z:f.z,sx:f.sx,sy:f.sy,sz:f.sz,ry:f.slot.ry});sparkLots.add(f.lot);}
      const k=isFresh?.001:1;
      transform.position.set(f.x,f.y,f.z);transform.rotation.set(0,f.slot.ry,0);
      transform.scale.set(f.sx*k,f.sy*k,f.sz*k);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
     });
     mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere?.();root.add(mesh);
    });
   }
   if(growing.length){
    // One shared instanced burst of gold sparkles per newly upgraded lot.
    let sparkles=null;
    const geom=THREE.OctahedronGeometry?new THREE.OctahedronGeometry(.17):new THREE.BoxGeometry(.22,.22,.22);
    const lotsArr=[...sparkLots];
    sparkles=new THREE.InstancedMesh(geom,material('sparkle'),SPARKLE_COUNT*lotsArr.length);
    sparkles.name='estates-upgrade-install-sparkles';sparkles.frustumCulled=false;
    root.add(sparkles);
    installAnim={t:0,growing,transform,sparkles,lots:lotsArr};
    tick(0);
   }
  }else{
   for(const [id,items]of mapped){
    if(!items.length)continue;
    const lot=lotById.get(id),group=new THREE.Group();
    group.name='tycoon-'+id;group.position.set(lot.position.x,lot.position.y,lot.position.z);
    for(const part of estateUpgradeExteriorParts(lot,items))box(group,part);
    root.add(group);
   }
  }
  return true;
 }
 // Cheap install animation: freshly purchased parts pop up with an ease-out
 // overshoot while a short sparkle spiral rises over the lot. Called per frame.
 function tick(dt=0){
  const a=installAnim;if(!a||disposed)return false;
  a.t+=Math.max(0,Math.min(.1,Number(dt)||0));
  const g=Math.min(1,a.t/INSTALL_SECONDS),k=Math.max(.001,easeOutBack(g)),touched=new Set();
  for(const {mesh,i,x,y0,dy,z,sx,sy,sz,ry}of a.growing){
   a.transform.position.set(x,y0+dy*Math.min(1,k),z);
   a.transform.rotation.set(0,ry,0);a.transform.scale.set(sx*k,sy*k,sz*k);
   a.transform.updateMatrix();mesh.setMatrixAt(i,a.transform.matrix);touched.add(mesh);
  }
  for(const mesh of touched)mesh.instanceMatrix.needsUpdate=true;
  const s=Math.min(1,a.t/SPARKLE_SECONDS);
  a.lots.forEach((lot,l)=>{for(let n=0;n<SPARKLE_COUNT;n++){
   const f=lot.buildingFootprint||{},ang=n/SPARKLE_COUNT*Math.PI*2+s*4,r=Math.max(f.width||6,f.depth||6)/2+1.3+Math.sin(n*1.7)*.8;
   const size=s>=1?0:Math.sin(Math.PI*s)*(1+(n%3)*.35);
   a.transform.position.set(lot.position.x+Math.cos(ang)*r,lot.position.y+.4+s*4.5+(n%4)*.35,lot.position.z+Math.sin(ang)*r);
   a.transform.rotation.set(0,s*6+n,0);a.transform.scale.set(size||.0001,size||.0001,size||.0001);
   a.transform.updateMatrix();a.sparkles.setMatrixAt(l*SPARKLE_COUNT+n,a.transform.matrix);
  }});
  a.sparkles.instanceMatrix.needsUpdate=true;
  if(g>=1&&s>=1){
   root.remove(a.sparkles);a.sparkles.geometry.dispose?.();installAnim=null;
  }
  return true;
 }
 // Swap in authored models once loaded (or back to primitives with an empty map).
 function setModels(next){
  if(disposed||!(next instanceof Map))return false;
  // Same verified IDs as before, so nothing counts as a fresh install.
  loadedModels=next;lastKey='';setUpgrades(lastProperties);
  return true;
 }
 return {root,previewRoot,setUpgrades,previewUpgrade,clearUpgradePreview,tick,setModels,get modelCount(){return loadedModels.size;},get animating(){return !!installAnim;},dispose(){
  if(disposed)return false;disposed=true;clear();clearUpgradePreview();
  parent.remove(root);parent.remove(previewRoot);return true;
 }};
}
