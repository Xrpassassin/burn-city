// Lightweight shared-island tycoon decorations. Never reveal private interiors.
// Every instance is driven by server-verified public unlock IDs, not localStorage.
const COLORS={stone:0x7b8287,wood:0x7c5437,metal:0x4a5860,gold:0xffbd65,
 green:0x4c8c4b,neon:0x2bd8c5,earth:0x43382d,red:0xa94936,water:0x3e86ab};
export function createEstateTycoonDecor({THREE,parent,lots}={}){
 if(!THREE?.Group||!THREE?.Mesh||!THREE?.BoxGeometry||!THREE?.MeshStandardMaterial||!parent?.add||!Array.isArray(lots))
  throw new TypeError('tycoon_decoration_dependencies_required');
 const root=new THREE.Group();root.name='estate-tycoon-verified-decorations';parent.add(root);
 const lotById=new Map(lots.filter(l=>l.propertyId).map(l=>[l.propertyId,l]));
 const permitted=new Set(['porch-lights','flower-garden','custom-sign','cozy-awning','privacy-fence','fire-pit',
 'game-lounge','garden-pond','reinforced-floor','grow-lounge','hobby-workshop','roof-garden','hidden-hatch',
 'grow-lounge-deluxe','security-upgrade','underground-bunker','bunker-arcade']);
 let lastKey='',disposed=false;
 const box=(g,id,x,y,z,w,h,d,c)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({
   color:COLORS[c]??COLORS.stone,metalness:c==='metal'?.48:0,roughness:.73,
   ...(c==='neon'?{emissive:COLORS.neon,emissiveIntensity:.45}:{})}));
  mesh.name=id;mesh.position.set(x,y,z);g.add(mesh);
 };
 function addItem(g,id,lot){
  const height=lot.buildingFootprint?.height??3,front=(lot.buildingFootprint?.depth??5)/2;
  switch(id){
   case 'porch-lights':
    for(const x of [-6,6]){box(g,id+'-pole',x,.95,6,.15,1.7,.15,'metal');box(g,id+'-lamp',x,1.85,6,.5,.28,.5,'gold');}break;
   case 'flower-garden':
    for(const x of [-6,6]){box(g,id+'-planter',x,.3,3.3,2,.45,.9,'wood');box(g,id+'-plant',x,.7,3.3,1.6,.38,.65,'green');}break;
   case 'custom-sign':
    box(g,id+'-post',-7,.92,7,.2,1.7,.2,'wood');box(g,id+'-plaque',-7,1.8,7,2.2,.65,.2,'gold');break;
   case 'cozy-awning':
    box(g,id+'-shelter',0,height*.8,front+.5,4,.2,2,'wood');
    for(const x of [-1.8,1.8])box(g,id+'-support',x,height*.4,front+1.3,.17,height*.8,.17,'wood');break;
   case 'privacy-fence':
    for(const side of [-1,1]){
     box(g,id+'-side',side*8.5,.7,0,.2,1.3,14,'wood');
     box(g,id+'-back',0,.7,-side*7,17,1.3,.2,'wood');
    }break;
   case 'fire-pit':
    box(g,id+'-hearth',6,.2,-5,1.8,.36,1.8,'stone');
    box(g,id+'-ember',6,.42,-5,.8,.18,.8,'red');break;
   case 'garden-pond':
    box(g,id+'-rim',-6,.12,-5,3,.2,2.6,'stone');
    box(g,id+'-water',-6,.25,-5,2.65,.06,2.22,'water');break;
   case 'reinforced-floor':
   case 'hidden-hatch':
   case 'underground-bunker':
    box(g,id+'-hatch',7,.2,-4.5,2.2,.18,2.2,id==='hidden-hatch'?'metal':'stone');
    if(id==='underground-bunker')box(g,id+'-access-light',7,.38,-4.5,.8,.14,.8,'neon');break;
   case 'roof-garden':
    for(const x of [-1.3,1.3])box(g,id+'-roof-planter',x,height+.35,0,1.7,.45,1.4,'green');break;
   case 'security-upgrade':
    for(const x of [-7,7]){box(g,id+'-post',x,1.4,6,.2,2.4,.2,'metal');box(g,id+'-camera',x,2.6,6,.65,.24,.45,'neon');}break;
   case 'grow-lounge':
   case 'grow-lounge-deluxe':
   case 'bunker-arcade':
    // Private rooms remain out of the public scene; only the hidden vent is visible.
    box(g,id+'-concealed-vent',7,.35,-6,1,.35,.7,'metal');break;
   default: break; // Indoor room entries get geometry when private interiors ship.
  }
 }
 const clear=()=>{
  root.traverse?.(n=>{n.geometry?.dispose?.();if(Array.isArray(n.material))n.material.forEach(m=>m?.dispose?.());else n.material?.dispose?.();});
  for(const child of [...root.children])root.remove(child);
 };
 function setUpgrades(properties=[]){
  if(disposed)return false;
  const mapped=new Map();
  for(const item of properties){
   if(!lotById.has(item?.propertyId)||!Array.isArray(item.unlockedItemIds))continue;
   const ids=[...new Set(item.unlockedItemIds.filter(id=>typeof id==='string'&&permitted.has(id)))].sort();
   mapped.set(item.propertyId,ids);
  }
  const key=[...lotById.keys()].map(id=>id+':'+(mapped.get(id)||[]).join(',')).join('|');
  if(key===lastKey)return false;
  clear();lastKey=key;
  for(const [id,items] of mapped){
   if(!items.length)continue;
   const lot=lotById.get(id),group=new THREE.Group();
   group.name='tycoon-'+id;group.position.set(lot.position.x,lot.position.y,lot.position.z);
   root.add(group);for(const itemId of items)addItem(group,itemId,lot);
  }
  return true;
 }
 return {root,setUpgrades,dispose(){if(disposed)return false;disposed=true;clear();parent.remove(root);return true;}};
}
