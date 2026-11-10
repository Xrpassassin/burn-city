// Architecturally grounded shared-island estate decorations.
// Every detail comes from the server-verified unlock list, not local wallet state.
// Authenticated interiors remain behind the separate private-room scene.
import {estateUpgradeExteriorParts,ESTATE_EXTERIOR_ITEM_IDS} from './estates-tycoon-architecture.mjs';
const COLORS=Object.freeze({
 stone:0x87827a,wood:0x79563b,metal:0x596c73,brass:0xb5a079,
 slate:0x344553,glass:0x85b8c1,warm:0xffca7b,green:0x557b4d,flower:0xd47c85,
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
   color:COLORS[key]??COLORS.stone,roughness:key==='water'?.22:key==='glass'?.26:key==='metal'?.47:key==='brass'?.4:.86,
   metalness:key==='metal'?.7:key==='brass'?.53:key==='slate'?.33:0,
   ...(key==='warm'?{emissive:COLORS.warm,emissiveIntensity:.54}:{})
  }));
  return materials.get(key);
 };
 const box=(group,part)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(part.w,part.h,part.d),material(part.mat));
  mesh.name=part.name;mesh.userData={estateUpgradeId:part.id,placement:part.placement};
  mesh.position.set(part.x,part.y,part.z);group.add(mesh);
 };
 function clear(){
  const geometries=new Set();
  root.traverse?.(obj=>{if(obj.geometry)geometries.add(obj.geometry);});
  for(const geom of geometries)geom.dispose?.();
  for(const mat of materials.values())mat.dispose?.();
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
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(part.w,part.h,part.d),
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
  for(const [id,items]of mapped){
   if(!items.length)continue;
   const lot=lotById.get(id),group=new THREE.Group();
   group.name='tycoon-'+id;group.position.set(lot.position.x,lot.position.y,lot.position.z);
   for(const part of estateUpgradeExteriorParts(lot,items))box(group,part);
   root.add(group);
  }
  return true;
 }
 return {root,previewRoot,setUpgrades,previewUpgrade,clearUpgradePreview,dispose(){
  if(disposed)return false;disposed=true;clear();clearUpgradePreview();
  parent.remove(root);parent.remove(previewRoot);return true;
 }};
}
