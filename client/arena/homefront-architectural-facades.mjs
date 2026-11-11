// Homefront landmark facade detail. These are thin, non-colliding, locally
// authored render meshes; building footprints, room portals and server
// interaction coordinates are untouched. Repeat panes use two draw batches.
const WINDOWS=Object.freeze({
  apartment_ruin:{z:2.355,panes:[[-1.55,2.38,.77,.92],[-.32,2.42,.77,.92],[.95,2.45,.72,.92]]},
  hospital_complex:{z:2.14,panes:[[-2.18,1.5,.88,.92],[-.94,1.5,.82,.92],[.88,1.5,.82,.92],[2.16,1.5,.88,.92]]},
  market_ruin:{z:2.145,panes:[[-1.66,1.24,.77,.9],[-.47,1.23,.8,.9],[.65,1.25,.8,.9],[1.85,1.2,.8,.9]]},
  research_facility:{z:2.515,panes:[[-1.93,2.55,.75,.78],[-.76,2.55,.75,.78],[.74,2.55,.75,.78],[1.9,2.55,.75,.78]]},
  foundry_yard:{z:2.35,panes:[[-1.68,1.77,.68,.75],[-.55,1.77,.68,.75],[.58,1.77,.68,.75],[1.72,1.77,.68,.75]]},
  power_station_access:{z:2.585,panes:[[-1.89,2.44,.74,.75],[-.72,2.44,.74,.75],[.47,2.44,.74,.75]]},
  bus_depot:{z:2.135,panes:[[-2.3,1.76,.8,.78],[-1.17,1.76,.8,.78],[1.19,1.76,.8,.78],[2.34,1.76,.8,.78]]},
  freight_depot:{z:2.56,panes:[[-1.65,1.85,.8,.71],[-.53,1.85,.8,.71],[.59,1.85,.8,.71],[1.71,1.85,.8,.71]]}
});
export function landmarkFacadeSpecs(archetype) {
 const entry=WINDOWS[archetype];
 return entry?{z:entry.z,panes:entry.panes.map(p=>p.slice())}:null;
}
function makeTrimGeometry(THREE){
 const positions=[];
 const rect=(x0,y0,x1,y1,z)=>{
   positions.push(x0,y0,z,x1,y0,z,x1,y1,z,x0,y0,z,x1,y1,z,x0,y1,z);
 };
 const t=.065;
 // Unpolished sash and horizontal mullion silhouettes. Tiny local Z offsets
 // keep framing in front of the glass without extending building footprints.
 rect(-.52,-.52,-.52+t,.52,.024);
 rect(.52-t,-.52,.52,.52,.024);
 rect(-.52,.52-t,.52,.52,.024);
 rect(-.52,-.52,.52,-.52+t,.024);
 rect(-.5,-.025,.5,.035,.024);
 rect(-.028,-.49,.029,.49,.024);
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 g.computeVertexNormals();g.computeBoundingSphere();
 return g;
}
const PALETTE=new WeakMap();
function shared(THREE){
 let cache=PALETTE.get(THREE);
 if(!cache){
   cache={
    pane:new THREE.MeshStandardMaterial({color:0x2b3d40,metalness:.28,roughness:.44,side:THREE.DoubleSide}),
    trim:new THREE.MeshStandardMaterial({color:0x343932,metalness:.16,roughness:.87,side:THREE.DoubleSide}),
    boards:new THREE.MeshStandardMaterial({color:0x5b4a39,metalness:0,roughness:.98,side:THREE.DoubleSide}),
    paneGeometry:new THREE.PlaneGeometry(1,1),
    trimGeometry:makeTrimGeometry(THREE)
   };
   PALETTE.set(THREE,cache);
 }
 return cache;
}
export function addLandmarkFacadeDetails(THREE,root,archetype,landmarkId){
 const spec=landmarkFacadeSpecs(archetype);
 if(!spec||!THREE?.InstancedMesh||!THREE?.Object3D)return {panes:0,drawBatches:0};
 const assets=shared(THREE), count=spec.panes.length;
 const paneMesh=new THREE.InstancedMesh(assets.paneGeometry,assets.pane,count);
 const sashMesh=new THREE.InstancedMesh(assets.trimGeometry,assets.trim,count);
 const dummy=new THREE.Object3D();
 for(let i=0;i<count;i++){
  const [x,y,w,h]=spec.panes[i];
  dummy.position.set(x,y,spec.z);
  dummy.rotation.set(0,0,0);dummy.scale.set(w,h,1);dummy.updateMatrix();
  paneMesh.setMatrixAt(i,dummy.matrix);
  sashMesh.setMatrixAt(i,dummy.matrix);
 }
 for(const [mesh,name] of [[paneMesh,'weathered-glass'],[sashMesh,'window-frames']]){
  mesh.name='homefront-'+archetype+'-'+name;
  mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.userData.landmarkId=landmarkId;
  mesh.userData.cosmeticNoCollision=true;
  mesh.instanceMatrix.needsUpdate=true;
  mesh.computeBoundingSphere();
  root.add(mesh);
 }
 // Boarded openings are one additional instanced draw, not per-window meshes.
 const boardIndexes=spec.panes.map((_,i)=>i).filter(i=>i%3===2);
 if(boardIndexes.length){
  const board=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,.16),assets.boards,boardIndexes.length*2);
  for(let i=0;i<boardIndexes.length;i++){
   const [x,y,w,h]=spec.panes[boardIndexes[i]];
   for(let j=0;j<2;j++){
    dummy.position.set(x,y+(j?-.17:.16)*h,spec.z+.034);
    dummy.rotation.set(0,0,j?-.12:.09);
    dummy.scale.set(w*.95,h,1);dummy.updateMatrix();
    board.setMatrixAt(i*2+j,dummy.matrix);
   }
  }
  board.name='homefront-'+archetype+'-boarded-windows';
  board.castShadow=false;board.receiveShadow=false;
  board.userData.landmarkId=landmarkId;
  board.userData.cosmeticNoCollision=true;
  board.instanceMatrix.needsUpdate=true;
  board.computeBoundingSphere();root.add(board);
 }
 return {panes:count,drawBatches:2+(boardIndexes.length?1:0)};
}
