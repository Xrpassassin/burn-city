// Public Estates Island furniture. Reuses the host Three.js namespace, no assets
// or second renderer; per-material instancing keeps 50+ fixtures inexpensive.
const FINISH=Object.freeze({
 stone:0x9c998e,steel:0x505b57,black:0x343b3e,wood:0x806149,
 copper:0x98795b,enamel:0x75867d,slate:0x4b5555,red:0xa64e42,
 warm:0xffd9aa,cream:0xe5dfcd,green:0x657463
});
export function estateNeighborhoodParts(fixture){
 const parts=[];
 const add=(name,x,y,z,w,h,d,mat,shape='box')=>parts.push({name,x,y,z,w,h,d,mat,shape,fixtureId:fixture.id});
 if(fixture.kind==='street-light'){
  add('footing',0,.11,0,.52,.21,.52,'stone','cylinder');
  add('tapered-base',0,.39,0,.3,.48,.3,'black','cylinder');
  add('pole',0,2.56,0,.145,4.25,.145,'steel','cylinder');
  add('collar',0,4.72,0,.27,.12,.27,'black','cylinder');
  add('crook',.32,4.77,0,.69,.09,.12,'steel');
  add('lantern-housing',.69,4.62,0,.6,.2,.43,'black');
  add('lantern-glass',.69,4.47,0,.51,.12,.37,'warm');
  add('lantern-cap',.69,4.75,0,.67,.09,.48,'slate');
 }else if(fixture.kind==='mailbox'){
  const premium=fixture.tier==='mansion'||fixture.tier==='family';
  add('footing',0,.085,0,.52,.16,.57,premium?'stone':'slate');
  add('post',0,.7,0,.16,1.13,.17,premium?'stone':'wood');
  add('body',0,1.23,-.03,.43,.33,.67,premium?'slate':'enamel');
  add('arched-lid',0,1.41,-.03,.42,.17,.66,premium?'black':'slate','sphere');
  add('front-door',0,1.23,.323,.39,.29,.045,'black');
  add('mail-slot',0,1.34,.36,.23,.027,.035,'cream');
  add('flag',.27,1.45,.07,.04,.32,.08,'red');
  add('flag-tip',.27,1.62,.07,.115,.095,.075,'red');
 }else if(fixture.kind==='street-sign'){
  add('foundation',0,.12,0,.46,.23,.46,'stone','cylinder');
  add('post',0,1.47,0,.13,2.5,.13,'steel','cylinder');
  add('sign-front',0,2.49,.01,1.87,.31,.085,'green');
  add('sign-border',0,2.49,-.048,1.96,.38,.04,'cream');
  add('sign-cap',0,2.76,0,.21,.07,.21,'slate');
 }else if(fixture.kind==='waste-bin'){
  add('base',0,.095,0,.68,.17,.68,'stone','cylinder');
  add('bin',0,.65,0,.53,.96,.53,'green','cylinder');
  add('rim',0,1.14,0,.61,.095,.61,'black','cylinder');
  add('lid',0,1.22,0,.62,.085,.62,'slate','cylinder');
  add('handle',0,1.27,.16,.23,.045,.1,'steel');
 }
 return parts;
}
export function createEstateNeighborhoodDecor({THREE,parent,manifest}={}){
 if(!THREE?.Group||!THREE?.Mesh||!THREE?.MeshStandardMaterial||!parent?.add)throw TypeError('neighborhood_render_dependencies_required');
 const root=new THREE.Group();root.name='estates-neighborhood-street-furniture';parent.add(root);
 const fixtures=manifest?.streetFurniture||[];
 const buckets=new Map();let partCount=0;
 for(const fixture of fixtures)for(const p of estateNeighborhoodParts(fixture)){
  const key=p.mat+'|'+p.shape;
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push({...p,position:fixture.position});partCount++;
 }
 const material=key=>new THREE.MeshStandardMaterial({
  color:FINISH[key],roughness:key==='warm'?.36:key==='steel'||key==='black'?.55:.82,
  metalness:key==='steel'||key==='black'?.55:key==='copper'?.32:0,
  ...(key==='warm'?{emissive:FINISH.warm,emissiveIntensity:1.15}: {})
 });
 const geometry=shape=>{
  if(shape==='cylinder'&&THREE.CylinderGeometry)return new THREE.CylinderGeometry(.5,.5,1,9);
  if(shape==='sphere'&&THREE.SphereGeometry)return new THREE.SphereGeometry(.5,10,7);
  return new THREE.BoxGeometry(1,1,1);
 };
 for(const [key,records]of buckets){
  const [mat,shape]=key.split('|'),geo=geometry(shape),finish=material(mat);
  if(THREE.InstancedMesh&&THREE.Object3D){
   const mesh=new THREE.InstancedMesh(geo,finish,records.length),transform=new THREE.Object3D();
   mesh.name='estates-furniture-'+key;mesh.frustumCulled=false;
   records.forEach((p,i)=>{
    transform.position.set(p.position.x+p.x,p.position.y+p.y,p.position.z+p.z);
    transform.scale.set(p.w,p.h,p.d);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
   });
   mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
  }else for(const p of records){
   const m=new THREE.Mesh(new THREE.BoxGeometry(p.w,p.h,p.d),finish);
   m.name=p.fixtureId+'-'+p.name;
   m.position.set(p.position.x+p.x,p.position.y+p.y,p.position.z+p.z);root.add(m);
  }
 }
 // Only three actual light sources on the island. All other lamps rely on
 // inexpensive emissive glass to remain visible without hurting mobile GPUs.
 if(typeof THREE.PointLight==='function'){
  for(const fixture of fixtures.filter(f=>f.kind==='street-light').filter((_,i)=>i===0||i===5||i===10)){
   const lamp=new THREE.PointLight(0xffd2a0,.75,10,2);
   lamp.name='estates-street-warm-local-light';lamp.castShadow=false;
   lamp.position.set(fixture.position.x+.69,fixture.position.y+4.47,fixture.position.z);
   root.add(lamp);
  }
 }
 return Object.freeze({root,fixtureCount:fixtures.length,partCount,drawBatches:buckets.size});
}
