// ORIGINAL ARENA ZOMBIES: original organic horror props, all built from
// smooth displaced geometry and a local PBR tissue texture. NOT the selected
// artists' Sketchfab GLBs (those still require official authentication).
// They are atmospheric room landmarks and do not replace infected models.
import * as THREE from './vendor/three.module.min.js';
import {planZombiesBioContainment} from './zombies-bio-containment-plan.mjs';

export function tissueTexture(){
 const size=128,rgba=new Uint8Array(size*size*4);
 // Layered deterministic marbling and bruised tissue, with subtle dark veins.
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  const a=Math.sin(u*23+Math.sin(v*17)*2.4)*Math.cos(v*22-u*3);
  const b=Math.sin((u+v)*57+Math.sin(u*19+v*37))*0.5;
  const c=Math.sin((u-v)*104+Math.cos(v*51)*3.2);
  const vein=Math.abs(Math.sin((u*2.2+Math.sin(v*4.5)*.17)*Math.PI*11))<.10?.52:0;
  const marbling=Math.min(1,Math.max(0,.53+a*.22+b*.17+c*.055-vein));
  const i=(y*size+x)*4;
  rgba[i]=Math.round(70+marbling*83);
  rgba[i+1]=Math.round(22+marbling*33);
  rgba[i+2]=Math.round(26+marbling*37);
  rgba[i+3]=255;
 }
 const t=new THREE.DataTexture(rgba,size,size,THREE.RGBAFormat);
 t.colorSpace=THREE.SRGBColorSpace;
 t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.minFilter=THREE.LinearMipmapLinearFilter;
 t.magFilter=THREE.LinearFilter;
 t.generateMipmaps=true;t.needsUpdate=true;
 t.userData.originalArt='Original BURN City procedural organic horror texture';
 return t;
}
export function lobeGeometry(){
 const geo=new THREE.IcosahedronGeometry(1,3);
 const pos=geo.getAttribute('position');
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
  const w=Math.sin(x*12.7+y*6.3+z*8.9)*.095+
    Math.sin(x*22.1-z*15.5+y*3.6)*.05+
    Math.cos(x*5.9+y*12.4-z*8.1)*.065;
  pos.setXYZ(i,x*(1+w),y*(1+w),z*(1+w));
 }
 geo.computeVertexNormals();
 return geo;
}
function safeMaterial(materials,m){
 materials.push(m);return m;
}
export function addZombiesBioContainment(root,layout,{
 low=false,g=x=>x
}={}){
 const sites=planZombiesBioContainment(layout,{low});
 if(!sites.length)return {sites:[],drawCalls:0,instances:0,
  update(){},dispose(){}};
 const texture=tissueTexture(),materials=[];
 const organic=safeMaterial(materials,new THREE.MeshStandardMaterial({
  map:texture,color:0xc8a7a0,roughness:.67,metalness:.015,
  side:THREE.FrontSide}));
 const steel=safeMaterial(materials,new THREE.MeshStandardMaterial({
  color:0x635954,roughness:.93,metalness:.17}));
 const tendon=safeMaterial(materials,new THREE.MeshStandardMaterial({
  color:0x4f1e25,roughness:.82,metalness:0}));
 const glass=safeMaterial(materials,new THREE.MeshBasicMaterial({
  color:0x778f91,transparent:true,opacity:.24,side:THREE.DoubleSide,
  depthWrite:false}));
 const stain=safeMaterial(materials,new THREE.MeshBasicMaterial({
  color:0x431d22,transparent:true,opacity:.48,depthWrite:false,
  polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide}));
 const warning=safeMaterial(materials,new THREE.MeshBasicMaterial({
  color:0xe9a197,toneMapped:false}));
 // Only 6 material families and at most 8 real room landmarks.
 const pools={steel:[],lobe:[],tendon:[],glass:[],stain:[],warning:[]};
 const add=(family,site,dx,y,dz,sx,sy,sz,tint=0xffffff)=>{
  pools[family].push({site,dx,y,dz,sx,sy,sz,tint});
 };
 for(const site of sites){
  const {kind,hash}=site;
  const surgical=kind==='surgical-ward'||kind==='sealed-infirmary';
  const cold=kind==='cryogenic-breach';
  const furnace=kind==='biofurnace';
  // Framed observation rack welded to the existing real wall; forms a
  // recognizable quarantine silhouette without obstructing floor movement.
  for(const x of [-.79,.79])
   add('steel',site,x,2.11,-.09,.085,1.86,.16,0x6c6b65);
  for(const y of [1.23,2.95])
   add('steel',site,0,y,-.085,1.70,.08,.16,0x77736c);
  add('steel',site,0,2.03,-.12,1.50,1.53,.12,
   cold?0x54636a:furnace?0x5e4540:0x46474b);
  // Medical bay / cryo ward / failed specimen cabinet identity.
  if(surgical||cold){
   for(const x of [-.48,.48])
    add('steel',site,x,1.58,.04,.11,.68,.18,0x807e76);
   add('glass',site,0,2.04,.15,1.47,1.54,1,0x8b9a96);
   for(const x of [-.49,.49])
    add('warning',site,x,2.87,.17,.23,.075,.08,
     cold?0x8ab9b9:0xdd786e);
  }else if(kind==='quarantine-control'){
   for(const y of [1.43,2.51]){
    add('steel',site,0,y,.15,1.37,.16,.17,0x303e42);
    for(const x of [-.48,-.16,.17,.49])
     add('warning',site,x,y+.04,.27,.15,.045,.06,0x8da0a0);
   }
  }else{
   for(const x of [-.50,.50])
    add('steel',site,x,2.12,.18,.12,1.56,.14,0x514b46);
   add('warning',site,0,2.91,.19,.94,.075,.07,0xe16f55);
  }
  // Pulpy, non-spherical organic masses clustered inside the open-fronted
  // specimen mount; original smooth geometry, visibly textured and veined.
  const N=site.massCount;
  for(let j=0;j<N;j++){
   const phase=(hash%8191)*.002+j*2.399;
   const dx=Math.sin(phase)*.44,dy=1.84+.42*Math.cos(phase*.79);
   const dz=.29+.14*Math.sin(phase*1.37);
   const sx=.24+.13*((j*13+hash%11)%9)/9;
   const sy=.33+.21*((j*11+hash%13)%9)/9;
   add('lobe',site,dx,dy,dz,sx,sy,.25+.13*(j%4)/4,0xc7aaa2);
   if(j%2===0){
    add('tendon',site,dx*.78,dy-.10,dz+.075,.22,.52,.19,0x5f232a);
   }
  }
  // Thin floor stain: no vertical contact face or obstacle.
  add('stain',site,0,.025,.34,1.18,1.05,1,0x4b2027);
 }
 const defs={
  steel:[()=>new THREE.BoxGeometry(1,1,1),steel],
  lobe:[lobeGeometry,organic],
  tendon:[()=>new THREE.TorusKnotGeometry(.24,.065,36,6,2,3),tendon],
  glass:[()=>new THREE.PlaneGeometry(1,1),glass],
  stain:[()=>new THREE.CircleGeometry(.5,32).rotateX(-Math.PI/2),stain],
  warning:[()=>new THREE.BoxGeometry(1,1,1),warning]
 };
 const mtx=new THREE.Matrix4(),position=new THREE.Vector3(),
  scale=new THREE.Vector3(),rot=new THREE.Quaternion();
 const axisY=new THREE.Vector3(0,1,0),axisX=new THREE.Vector3(1,0,0);
 const tilt=new THREE.Quaternion(),color=new THREE.Color();
 let draws=0,instances=0,blobMesh=null;
 for(const [name,pool] of Object.entries(pools)){
  if(!pool.length)continue;
  const [makeGeometry,mat]=defs[name];
  const geom=g(makeGeometry()),mesh=new THREE.InstancedMesh(geom,mat,pool.length);
  mesh.name='zombies-bio-containment-'+name;
  mesh.userData.cosmeticOnly=true;
  mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
  for(let i=0;i<pool.length;i++){
   const item=pool[i],a=item.site.yaw;
   position.set(item.site.x+item.dx*Math.cos(a)+item.dz*Math.sin(a),
    item.y,item.site.z-item.dx*Math.sin(a)+item.dz*Math.cos(a));
   scale.set(item.sx,item.sy,item.sz);
   rot.setFromAxisAngle(axisY,a);
   if(name==='glass'){
    tilt.setFromAxisAngle(axisX,-.10);rot.multiply(tilt);
   }
   mtx.compose(position,rot,scale);
   mesh.setMatrixAt(i,mtx);
   mesh.setColorAt(i,color.setHex(item.tint));
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.computeBoundingSphere();
  root.add(mesh);draws++;instances+=pool.length;
  if(name==='lobe')blobMesh=mesh;
 }
 // Pulsation is restrained and never adds geometry or light sources.
 let t=0,acc=0;
 const blobs=pools.lobe,transforms=blobs.map((item,i)=>{
  const a=item.site.yaw;
  return {p:new THREE.Vector3(item.site.x+item.dx*Math.cos(a)+item.dz*Math.sin(a),
    item.y,item.site.z-item.dx*Math.sin(a)+item.dz*Math.cos(a)),
   q:new THREE.Quaternion().setFromAxisAngle(axisY,a),
   s:new THREE.Vector3(item.sx,item.sy,item.sz),
   phase:(item.site.hash%1021)*.018+i*.91};
 });
 return {sites,drawCalls:draws,instances,organicMasses:blobs.length,
  update(dt){
   if(!blobMesh||!Number.isFinite(dt)||dt<=0)return;
   const step=low?.23:.10;
   t+=Math.min(.1,dt);acc+=Math.min(.1,dt);
   if(acc<step)return;acc=0;
   for(let i=0;i<transforms.length;i++){
    const tr=transforms[i],p=.94+.075*Math.sin(t*(1.28+(i%4)*.11)+tr.phase);
    scale.copy(tr.s).multiplyScalar(p);
    mtx.compose(tr.p,tr.q,scale);
    blobMesh.setMatrixAt(i,mtx);
   }
   blobMesh.instanceMatrix.needsUpdate=true;
  },
  dispose(){
   texture.dispose();
   for(const material of materials)material.dispose();
  }
 };
}
