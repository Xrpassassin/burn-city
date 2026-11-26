// Cosmetic Kenney CC0 yard dressing in each lot's front setback: a walk to the
// door, a low fence with a gate gap, bushes, flowers and path lights. No new
// colliders, so public paths and owned upgrades (reinforced floor, hatches,
// ponds) in the side and rear yards stay clear.
import {createEstateKitCache,ESTATE_KIT_YARD,estatesLowGraphics} from './estates-kit-models.mjs';

const LOT_W=20,LOT_D=18;
function doorOffset(lot){
 const f=lot.buildingFootprint;if(!f)return {x:0,z:2.5};
 const W=f.width-.6,D=f.depth-.6,doorX=lot.tier==='apartment'?0:-W*.24;
 return {x:doorX,z:D/2};
}
function hash(n){return ((n*1103515245+12345)>>>0)/4294967296;}

export function planEstateLotDressing(lot,{low=false}={}){
 const f=lot.buildingFootprint;if(!f)return [];
 const {x:dx,z:front}=doorOffset(lot);
 const ox=lot.position.x,oz=lot.position.z;
 const halfW=LOT_W/2,halfD=LOT_D/2;
 const edgeZ=halfD-.35,edgeX=halfW-.35;
 const props=[];
 const add=(id,x,y,z,s=1,ry=0)=>props.push({id,x,y,z,s,ry});
 // Stone path from the front door to the lot's street edge (front is +Z).
 const pathEnd=edgeZ-.15,pathStart=front+.55;
 for(let z=pathStart,i=0;z<=pathEnd;z+=.95,i++){
  add(i===0?'path-stone-end':'path-stone',ox+dx,.02,oz+z,1.05,i===0?0:0);
 }
 // Low fence on the front and sides of the front yard, with a gate at the door.
 const gate=1.6,span=2.05,kind=low?'fence-low':'fence-simple';
 for(let x=-edgeX;x<=edgeX+0.01;x+=span){
  if(Math.abs(x-dx)<gate)continue;
  add(kind,ox+x,0,oz+edgeZ,2.05,0);
 }
 for(const side of [-1,1]){
  for(let z=edgeZ-span;z>front+.4;z-=span)add(kind,ox+side*edgeX,0,oz+z,2.05,Math.PI/2);
  add('fence-corner',ox+side*edgeX,0,oz+edgeZ,2.05,side>0?0:-Math.PI/2);
 }
 // Landscaping: bushes and flowers in the front corners, kept off the walk.
 const seed=(lot.propertyId||lot.id||'lot').split('').reduce((n,c)=>n+c.charCodeAt(0),0);
 const bushes=low?2:4;
 for(let i=0;i<bushes;i++){
  const side=i%2?1:-1,t=.22+hash(seed+i*9)*.28;
  const x=ox+side*(Math.abs(dx)+1.1+t*2.2),z=oz+front+.7+hash(seed+i*3)*Math.max(.6,edgeZ-front-1.4);
  if(Math.abs((x-ox)-dx)<1.1)continue;
  add(i<2?'bush-detailed':(low?'bush-small':'bush'),x,0,z,low?2.6:3.1,hash(seed+i)*Math.PI*2);
 }
 if(!low){
  const flowers=['flower-red','flower-yellow','flower-purple'];
  for(let i=0;i<6;i++){
   const side=i%2?1:-1;
   const x=ox+dx+side*(.7+.35*(i>>1)),z=oz+front+.85+hash(seed+40+i)*1.1;
   add(flowers[i%3],x,0,z,2.4,hash(seed+i+7)*6);
  }
  add('pot',ox+dx-1.15,0,oz+front+.45,2.2,0);
  add('rock-flat',ox+dx+1.35,0,oz+front+.4,1.8,hash(seed)*4);
 }
 return props;
}

export function createEstateLotDressing({THREE,parent,lots=[],kitCache=null,low=estatesLowGraphics()}={}){
 if(!THREE?.Group||!THREE?.Mesh||!parent?.add)throw TypeError('lot_dressing_dependencies_required');
 const root=new THREE.Group();root.name='estates-lot-dressing';parent.add(root);
 const cache=kitCache||createEstateKitCache(THREE);
 const planned=lots.flatMap(lot=>planEstateLotDressing(lot,{low}));
 const ids=[...new Set(planned.map(p=>p.id))].filter(id=>ESTATE_KIT_YARD.includes(id));
 let disposed=false;
 const load=ids.length?cache.load(ids).then(found=>{
  if(disposed)return;
  const buckets=new Map();
  for(const prop of planned){
   const rec=found.get(prop.id);if(!rec)continue;
   rec.parts.forEach((part,i)=>{
    const key=prop.id+'|'+i;
    if(!buckets.has(key))buckets.set(key,{part,items:[]});
    buckets.get(key).items.push(prop);
   });
  }
  const tmp=new THREE.Object3D();
  for(const {part,items} of buckets.values()){
   if(THREE.InstancedMesh&&items.length>1){
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
 }).catch(()=>{}):Promise.resolve();
 function dispose(){
  disposed=true;root.removeFromParent?.();
  root.traverse?.(n=>{if(!n.userData?.sharedModel){n.geometry?.dispose?.();const mats=Array.isArray(n.material)?n.material:[n.material];for(const m of mats)m?.dispose?.();}});
  if(!kitCache)cache.dispose();
 }
 return Object.freeze({root,plannedCount:planned.length,ready:load,dispose,get low(){return low;}});
}
