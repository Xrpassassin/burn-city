// Lightweight original salvage-rover geometry; world state comes exclusively
// from server/homefront-vehicles.js. No heavy GLTF network dependency.
export function buildRoverMesh(THREE){
 const group=new THREE.Group();
 const metal=new THREE.MeshStandardMaterial({color:0x454941,roughness:0.86});
 const rust=new THREE.MeshStandardMaterial({color:0x81543c,roughness:0.97});
 const rubber=new THREE.MeshStandardMaterial({color:0x222622,roughness:0.99});
 const glass=new THREE.MeshStandardMaterial({color:0x4a5c58,roughness:0.42,metalness:0.1});
 const signal=new THREE.MeshStandardMaterial({color:0xddb86f,emissive:0x705022,emissiveIntensity:0.38});
 const box=(m,w,h,d,x,y,z)=>{
  const obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  obj.position.set(x,y,z);group.add(obj);return obj;
 };
 box(metal,1.72,0.35,2.65,0,0.54,0);
 box(rust,1.46,0.16,0.75,0,0.8,0.89); // bare hood
 box(metal,1.36,0.13,0.97,0,0.83,-0.43); // rear cargo platform
 box(rust,1.28,0.12,0.73,0,1.06,-0.77);
 box(glass,1.42,0.08,0.12,0,1.43,0.25); // short armored windshield
 for(const x of [-0.69,0.69]){
  box(metal,0.08,0.91,0.07,x,1.12,0.25); // cage uprights
  box(rust,0.08,0.44,0.07,x,1.14,-0.80);
 }
 box(metal,1.48,0.08,0.08,0,1.62,0.25);
 box(signal,0.23,0.17,0.08,-0.52,0.68,1.34);
 box(signal,0.23,0.17,0.08,0.52,0.68,1.34);
 box(rust,1.62,0.11,0.12,0,0.4,-1.38); // cracked rear bumper
 for(const x of [-0.95,0.95])for(const z of [-0.91,0.91]){
  const wheel=new THREE.Mesh(new THREE.CylinderGeometry(0.43,0.43,0.3,10),rubber);
  wheel.rotation.z=Math.PI/2;wheel.position.set(x,0.43,z);group.add(wheel);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.19,0.305,8),metal);
  hub.rotation.z=Math.PI/2;hub.position.copy(wheel.position);group.add(hub);
 }
 group.userData.roverModel=true;
 return group;
}
