// Cosmetic Kenney CC0 yard dressing in each lot's front setback: a walk to the
// door, a low fence with a gate gap, bushes, flowers and path lights. No new
// colliders, so public paths and owned upgrades (reinforced floor, hatches,
// ponds) in the side and rear yards stay clear.
import {createEstateKitCache,ESTATE_KIT_YARD,estatesLowGraphics} from './estates-kit-models.mjs';
import {estateFurnitureQuality} from './estates-furniture-quality.mjs';

const LOT_W=20,LOT_D=18;
function doorOffset(lot){
 const f=lot.buildingFootprint;if(!f)return {x:0,z:2.5};
 const W=f.width-.6,D=f.depth-.6,doorX=lot.tier==='apartment'?0:-W*.24;
 return {x:doorX,z:D/2};
}
function hash(n){return ((n*1103515245+12345)>>>0)/4294967296;}

export function planEstateLotDressing(lot,{low=false,owned=false,upgradeIds=[]}={}){
 const f=lot.buildingFootprint;if(!f)return [];
 const upgrades=new Set(Array.isArray(upgradeIds)?upgradeIds:[]);
 // Unsold lots stay on the basic yard set. Owned lots scale planting with upgrade count.
 const quality=owned?estateFurnitureQuality({upgrades:upgradeIds}):0;
 const {x:dx,z:front}=doorOffset(lot);
 const ox=lot.position.x,oz=lot.position.z;
 const halfW=LOT_W/2,halfD=LOT_D/2;
 const edgeZ=halfD-.35,edgeX=halfW-.35;
 const props=[];
 const add=(id,x,y,z,s=1,ry=0)=>props.push({id,x,y,z,s,ry});
 // Paid porch lights already lay entry pavers; skip a second stone walk.
 if(!upgrades.has('porch-lights')){
  const pathEnd=edgeZ-.15,pathStart=front+.55;
  const pathId=quality>=1&&!low?'path-wood':'path-stone';
  for(let z=pathStart,i=0;z<=pathEnd;z+=.95,i++){
   add(i===0?'path-stone-end':pathId,ox+dx,.02,oz+z,owned?1.15:1.05,0);
  }
 }
 // Paid privacy fence replaces the decorative Kenney front fence.
 if(!upgrades.has('privacy-fence')){
  const gate=1.6,span=2.05,kind=quality>=1&&!low?'fence-planks':(low?'fence-low':'fence-simple');
  for(let x=-edgeX;x<=edgeX+0.01;x+=span){
   if(Math.abs(x-dx)<gate)continue;
   add(kind,ox+x,0,oz+edgeZ,2.05,0);
  }
  for(const side of [-1,1]){
   for(let z=edgeZ-span;z>front+.4;z-=span)add(kind,ox+side*edgeX,0,oz+z,2.05,Math.PI/2);
   add('fence-corner',ox+side*edgeX,0,oz+edgeZ,2.05,side>0?0:-Math.PI/2);
  }
 }
 // Landscaping: bushes and flowers in the front corners, kept off the walk.
 const seed=(lot.propertyId||lot.id||'lot').split('').reduce((n,c)=>n+c.charCodeAt(0),0);
 const bushes=low?(quality>=1?3:2):(quality>=2?8:quality>=1?6:4);
 for(let i=0;i<bushes;i++){
  const side=i%2?1:-1,t=.22+hash(seed+i*9)*.28;
  const x=ox+side*(Math.abs(dx)+1.1+t*2.2),z=oz+front+.7+hash(seed+i*3)*Math.max(.6,edgeZ-front-1.4);
  if(Math.abs((x-ox)-dx)<1.1)continue;
  add(i<2?'bush-detailed':(low?'bush-small':'bush'),x,0,z,low?2.6:(owned?3.3:3.1),hash(seed+i)*Math.PI*2);
 }
 const flowerCount=low?(quality>=1?3:0):(quality>=2?10:quality>=1?8:4);
 if(flowerCount){
  const flowers=['flower-red','flower-yellow','flower-purple'];
  for(let i=0;i<flowerCount;i++){
   const side=i%2?1:-1;
   const x=ox+dx+side*(.7+.35*(i>>1)),z=oz+front+.85+hash(seed+40+i)*1.1;
   add(flowers[i%3],x,0,z,owned?2.6:2.4,hash(seed+i+7)*6);
  }
  add('pot',ox+dx-1.15,0,oz+front+.45,quality>=1?2.4:2.2,0);
  add('rock-flat',ox+dx+1.35,0,oz+front+.4,1.8,hash(seed)*4);
  if(quality>=1&&!low){
   add('pot',ox+dx+1.15,0,oz+front+.5,2.3,.4);
   add('grass',ox+dx-2.1,0,oz+front+1.3,2.6,hash(seed+3)*4);
   add('grass',ox+dx+2.1,0,oz+front+1.15,2.5,hash(seed+5)*4);
  }
  if(quality>=2&&!low){
   add('pot',ox+dx-1.85,0,oz+front+.7,2.2,.2);
   add('bush-detailed',ox+dx+2.4,0,oz+front+1.4,3.2,hash(seed+11)*4);
   add('grass',ox+dx-2.6,0,oz+front+.9,2.4,hash(seed+13)*4);
  }
 }
 return props;
}

export function createEstateLotDressing({THREE,parent,lots=[],kitCache=null,low=estatesLowGraphics()}={}){
 if(!THREE?.Group||!THREE?.Mesh||!parent?.add)throw TypeError('lot_dressing_dependencies_required');
 const root=new THREE.Group();root.name='estates-lot-dressing';parent.add(root);
 const cache=kitCache||createEstateKitCache(THREE);
 let disposed=false,generation=0,ready=Promise.resolve(),ownedIds=new Set(),upgradeMap=new Map(),presentationKey="";
 function planAll(){
  return lots.flatMap(lot=>planEstateLotDressing(lot,{
   low,owned:ownedIds.has(lot.propertyId||lot.id),
   upgradeIds:upgradeMap.get(lot.propertyId||lot.id)||[]
  }));
 }
 function clearMeshes(){
  const geos=new Set(),mats=new Set();
  root.traverse?.(n=>{
   if(!n.userData?.sharedModel){
    if(n.geometry)geos.add(n.geometry);
    for(const m of Array.isArray(n.material)?n.material:[n.material])if(m)mats.add(m);
   }
  });
  for(const child of [...root.children])root.remove(child);
  for(const g of geos)g.dispose?.();
  for(const m of mats)m.dispose?.();
 }
 function mount(planned,gen){
  if(disposed||gen!==generation)return;
  const ids=[...new Set(planned.map(p=>p.id))].filter(id=>ESTATE_KIT_YARD.includes(id));
  ready=(ids.length?cache.load(ids):Promise.resolve(new Map())).then(found=>{
   if(disposed||gen!==generation)return;
   clearMeshes();
   if(!found)return;
   const buckets=new Map();
   for(const prop of planned){
    const rec=found.get(prop.id);if(!rec)continue;
    rec.parts.forEach((part,i)=>{
     const key=prop.id+'|'+i;
     if(!buckets.has(key))buckets.set(key,{part,items:[]});
     buckets.get(key).items.push(prop);
    });
   }
   const tmp=THREE.Object3D?new THREE.Object3D():null;
   for(const {part,items} of buckets.values()){
    if(THREE.InstancedMesh&&tmp&&items.length>1){
     const mesh=new THREE.InstancedMesh(part.geometry,part.material,items.length);
     mesh.name='estates-yard-'+items[0].id;mesh.frustumCulled=true;mesh.userData.sharedModel=true;
     items.forEach((p,i)=>{
      tmp.position.set(p.x,p.y,p.z);tmp.rotation.set(0,p.ry||0,0);tmp.scale.set(p.s,p.s,p.s);tmp.updateMatrix();
      mesh.setMatrixAt(i,tmp.matrix);
     });
     mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere?.();root.add(mesh);
    }else for(const p of items){
     const m=new THREE.Mesh(part.geometry,part.material);m.userData.sharedModel=true;
     m.position.set(p.x,p.y,p.z);m.rotation.y=p.ry||0;m.scale.setScalar(p.s);root.add(m);
    }
   }
  }).catch(()=>{});
 }
 function setPresentation({owned=null,upgrades=null}={}){
  if(disposed)return false;
  if(owned)ownedIds=owned instanceof Set?owned:new Set(owned);
  if(upgrades)upgradeMap=upgrades instanceof Map?upgrades:new Map(Object.entries(upgrades||{}));
  const key=[...ownedIds].sort().join(',')+'||'+[...upgradeMap.entries()].map(([id,ids])=>id+':'+(ids||[]).join('+')).sort().join(';');
  if(key===presentationKey)return false;
  presentationKey=key;
  const planned=planAll();
  generation++;mount(planned,generation);
  return true;
 }
 const planned=planAll();
 mount(planned,generation);
 function dispose(){
  disposed=true;clearMeshes();root.removeFromParent?.();
  if(!kitCache)cache.dispose();
 }
 return Object.freeze({root,plannedCount:planned.length,ready,setPresentation,dispose,get low(){return low;}});
}
