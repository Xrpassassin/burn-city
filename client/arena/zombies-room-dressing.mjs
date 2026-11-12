// Original Zombies map appearance upgrade: four to five InstancedMesh draws,
// regardless of how many procedural rooms are generated. Geometry, materials
// and disposal live inside createCodWorld's existing asset pools.
import * as THREE from 'three';
import {planZombiesRoomDressing,ZOMBIES_ROOM_PALETTE} from './zombies-room-dressing-plan.mjs';

export function addZombiesRoomDressing(root,layout,{low=false,g=x=>x,basic=(c,o)=>new THREE.MeshBasicMaterial({color:c,...o})}={}){
 const sites=planZombiesRoomDressing(layout,{low});
 if(!sites.length)return {sites:[],drawCalls:0};
 const entries={box:[],lamp:[],tube:[],ring:[],floor:[]};
 const push=(bucket,s,dx,y,dz,sx,sy,sz,col,rx=0)=>{
  entries[bucket].push({s,dx,y,dz,sx,sy,sz,col,rx});
 };
 for(const s of sites){
  const p=ZOMBIES_ROOM_PALETTE[s.theme]||ZOMBIES_ROOM_PALETTE.industrial;
  const dark=0x242322,black=0x171b1c;
  const metal=p.metal,light=p.light,base=p.shell;
  const box=(dx,y,dz,sx,sy,sz,color)=>push('box',s,dx,y,dz,sx,sy,sz,color);
  const lamp=(dx,y,dz,sx,sy,sz,color)=>push('lamp',s,dx,y,dz,sx,sy,sz,color);
  const tube=(dx,y,dz,r,h,color)=>push('tube',s,dx,y,dz,r,h,r,color);
  // Every prop is bolted into a wall or suspended: NEVER place invisible
  // solid barricades, maze obstacles, collision proxies or new gameplay LOS.
  if(s.theme==='warehouse'||s.theme==='loading'){
   for(const x of [-.65,.65])box(x,1.93,0,.09,1.85,.15,metal);
   for(const y of [1.42,2.07,2.67])box(0,y,.08,1.47,.085,.38,base);
   if(s.theme==='loading')lamp(0,2.97,.2,1.2,.11,.07,light);
   else for(const x of [-.37,.4])box(x,2.35,.17,.53,.4,.36,base);
  }else if(s.theme==='lab'){
   box(0,1.7,-.035,1.52,.15,.3,base);
   box(0,2.87,-.06,1.52,.15,.3,metal);
   for(const x of [-.43,0,.43]){
    tube(x,2.3,.17,.16,.92,metal);
    lamp(x,2.55,.31,.18,.21,.06,light);
   }
   lamp(0,1.62,.22,.91,.055,.08,light);
  }else if(s.theme==='pump'){
   for(const x of [-.52,.52])tube(x,2.12,.025,.12,1.8,metal);
   box(0,2.17,.1,1.17,.22,.17,base);
   push('ring',s,0,2.17,.27,.9,.9,.9,light);
   lamp(0,2.93,.16,.55,.1,.08,light);
  }else if(s.theme==='furnace'||s.theme==='slag'){
   box(0,2.1,-.02,1.7,1.2,.16,base);
   box(0,2.17,.09,1.35,.64,.085,black);
   for(let k=0;k<4;k++)box(-.55+k*.37,2.12,.17,.095,.76,.07,metal);
   lamp(0,1.73,.19,1.2,.07,.055,light);
   if(s.theme==='slag')lamp(0,2.6,.19,.88,.06,.055,light);
  }else if(s.theme==='cold'){
   for(const x of [-.37,.37]){
    box(x,2.13,-.02,.7,1.72,.15,base);
    for(const y of [1.58,2.15,2.7])box(x,y,.08,.53,.085,.08,metal);
   }
   lamp(0,2.93,.16,1.23,.09,.05,light);
  }else if(s.theme==='archive'){
   box(0,2.13,-.02,1.58,1.82,.15,base);
   for(let y=1.4;y<=2.9;y+=.36){
    box(0,y,.1,1.38,.25,.09,metal);
    lamp(.49,y,.17,.13,.025,.045,light);
   }
  }else if(s.theme==='chapel'){
   box(0,2.2,-.02,1.08,1.92,.18,base);
   box(0,2.35,.11,.69,1.38,.1,black);
   lamp(0,2.1,.2,.11,1.1,.07,light);
   lamp(0,2.62,.2,.49,.075,.07,light);
   for(const x of [-.63,.63])tube(x,1.7,.06,.07,.66,metal);
  }else if(s.theme==='generator'){
   for(const x of [-.47,.47]){
    box(x,2.12,-.02,.62,1.66,.25,base);
    for(let j=0;j<3;j++)tube(x-.14+j*.14,2.12,.18,.045,1.18,metal);
   }
   lamp(0,2.98,.2,1.3,.09,.05,light);
  }else if(s.theme==='courtyard'){
   box(0,2.16,-.03,1.73,1.24,.18,base);
   for(const x of [-.58,-.18,.22,.62])box(x,2.16,.08,.085,1.0,.07,metal);
   lamp(0,2.92,.16,.85,.08,.04,light);
  }else{
   // Control rooms, spawn bays, service tunnels and utility annexes:
   // scratched control consoles with uneven status indicators.
   box(0,2.12,-.03,1.54,1.46,.15,base);
   box(0,2.27,.09,1.31,.81,.075,black);
   for(const y of [2.61,2.36,2.11])
    for(let x=-.47;x<=.49;x+=.32)
     lamp(x,y,.15,.19,.065,.035,(s.variant+y+x)>4.0?light:metal);
   box(0,1.52,.12,1.31,.085,.11,metal);
   if(s.theme==='corridor'){
    lamp(0,2.97,.12,1.46,.10,.08,light);
   }
  }
  // A low relief grime stain grounds the fixture visually. This is a plane,
  // never a collider, and is safely away from server-significant stations.
  if(!low||s.theme==='lab'||s.theme==='chapel')
   push('floor',s,0,.024,.38,1.35,1,.86,s.hash%3===0?0x211b19:0x242521);
 }
 const modes={
  box:[()=>new THREE.BoxGeometry(1,1,1),()=>basic(0xffffff)],
  lamp:[()=>new THREE.BoxGeometry(1,1,1),()=>basic(0xffffff,{toneMapped:false})],
  tube:[()=>new THREE.CylinderGeometry(1,1,1,7),()=>basic(0xffffff)],
  ring:[()=>new THREE.TorusGeometry(.28,.055,4,12),()=>basic(0xffffff)],
  floor:[()=>new THREE.PlaneGeometry(1,1),()=>basic(0xffffff,{depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})]
 };
 const pos=new THREE.Vector3(),sc=new THREE.Vector3(),q=new THREE.Quaternion();
 const face=new THREE.Quaternion(),tilt=new THREE.Quaternion();
 const mtx=new THREE.Matrix4(),axisY=new THREE.Vector3(0,1,0);
 let draws=0,instances=0;
 for(const [name,arr] of Object.entries(entries)){
  if(!arr.length)continue;
  const [geo,mat]=modes[name];
  const mesh=new THREE.InstancedMesh(g(geo()),mat(),arr.length);
  mesh.name='zombies-room-dressing-'+name;
  mesh.userData.cosmeticOnly=true;
  for(let i=0;i<arr.length;i++){
   const it=arr[i],a=it.s.yaw;
   // Rotate each fixture's local offset so every panel faces the adjacent
   // room interior. The only dynamic input is the server's stable map seed.
   const x=it.s.x+it.dx*Math.cos(a)+it.dz*Math.sin(a),
         z=it.s.z-it.dx*Math.sin(a)+it.dz*Math.cos(a);
   pos.set(x,it.y,z);sc.set(it.sx,it.sy,it.sz);
   face.setFromAxisAngle(axisY,a);
   if(name==='floor')tilt.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),q.copy(face).multiply(tilt);
   else q.copy(face);
   mtx.compose(pos,q,sc);
   mesh.setMatrixAt(i,mtx);
   mesh.setColorAt(i,new THREE.Color(it.col));
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.computeBoundingSphere();
  root.add(mesh);draws++;instances+=arr.length;
 }
 return {sites,drawCalls:draws,instances};
}
