import {estateSurfaceProperties,disposeEstateSurfaceMaterial} from './estates-material-fidelity.mjs';
// Architecturally grounded shared-island estate decorations.
// Every detail comes from the server-verified unlock list, not local wallet state.
// Authenticated interiors remain behind the separate private-room scene.
import {estateUpgradeExteriorParts,ESTATE_EXTERIOR_ITEM_IDS} from './estates-tycoon-architecture.mjs';
const COLORS=Object.freeze({
 stone:0x91897d,wood:0x78604b,metal:0x596970,brass:0xbba16d,
 slate:0x35444e,glass:0x86b4bd,warm:0xffc782,green:0x567e4b,flower:0xd98795,
 gold:0xc6a663,earth:0x493728,red:0xa74731,water:0x3a8193
});
const known=new Set(ESTATE_EXTERIOR_ITEM_IDS);
export function createEstateTycoonDecor({THREE,parent,lots}={}){
 if(!THREE?.Group||!THREE?.Mesh||!THREE?.BoxGeometry||!THREE?.MeshStandardMaterial||!parent?.add||!Array.isArray(lots))
  throw TypeError('tycoon_decoration_dependencies_required');
 const root=new THREE.Group();root.name='estate-tycoon-verified-decorations';parent.add(root);
 // Preview is an entirely separate local-only scene layer. Never add preview IDs
 // to the verified server-backed upgrade list or public ownership state.
 const previewRoot=new THREE.Group();previewRoot.name='estate-tycoon-preview-only';parent.add(previewRoot);
 const lotById=new Map(lots.filter(l=>l.propertyId).map(l=>[l.propertyId,l]));
 let lastKey='',disposed=false;
 const materials=new Map();
 const material=key=>{
  if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({
   color:COLORS[key]??COLORS.stone,roughness:key==='water'?.18:key==='glass'?.22:key==='metal'?.39:key==='brass'?.35:key==='wood'?.78:.89,
   metalness:key==='metal'?.72:key==='brass'?.62:key==='slate'?.26:0,
   ...(key==='warm'?{emissive:COLORS.warm,emissiveIntensity:.72}:{}),
   ...(key==='water'?{transparent:true,opacity:.84}:{} ),
   ...estateSurfaceProperties(THREE,key)
  }));
  return materials.get(key);
 };
 // Primitive selection is immutable and tied to server-verified, measured parts.
 // Round lenses, bollards and flower blossoms need not remain cubic. Unsupported
 // test/lightweight Three namespaces fall back to original boxes.
 const partGeometry=(part,unit=false)=>{
  const w=unit?1:part.w,h=unit?1:part.h,d=unit?1:part.d;
  if(part.shape==='cylinder'&&THREE.CylinderGeometry){
   const geom=new THREE.CylinderGeometry(w/2,w/2,h,10);
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
  root.traverse?.(obj=>{if(obj.geometry)geometries.add(obj.geometry);});
  for(const geom of geometries)geom.dispose?.();
  for(const mat of materials.values())disposeEstateSurfaceMaterial(mat);
  materials.clear();
  for(const child of [...root.children])root.remove(child);
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
  clear();lastKey=key;
  const upgrades=[];
  for(const [id,items]of mapped){
   if(!items.length)continue;
   const lot=lotById.get(id);
   for(const part of estateUpgradeExteriorParts(lot,items))upgrades.push({lot,part});
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
   const transform=new THREE.Object3D();
   for(const [key,entries]of buckets){
    const [name,shape]=key.split('|');
    const mesh=new THREE.InstancedMesh(partGeometry({shape},true),material(name),entries.length);
    mesh.name='estates-upgrades-instanced-'+name+'-'+shape;
    mesh.userData={verifiedUpgrades:true,visibleParts:entries.length};
    entries.forEach(({lot,part},i)=>{
     transform.position.set(lot.position.x+part.x,lot.position.y+part.y,lot.position.z+part.z);
     transform.rotation.set(0,0,0);transform.scale.set(part.w,part.h,part.d);
     transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere?.();root.add(mesh);
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
 return {root,previewRoot,setUpgrades,previewUpgrade,clearUpgradePreview,dispose(){
  if(disposed)return false;disposed=true;clear();clearUpgradePreview();
  parent.remove(root);parent.remove(previewRoot);return true;
 }};
}
