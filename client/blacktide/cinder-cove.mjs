// Cinder Cove visual landmark pass. Decorative meshes only; no collision or shore traversal yet.
// All landmarks share geometry/materials to limit GPU allocations.
export function buildCinderCove(THREE) {
  const group = new THREE.Group();
  group.name='cinder-cove-landmarks';
  const wood = new THREE.MeshStandardMaterial({color:0x65432b,roughness:.9});
  const plaster = new THREE.MeshStandardMaterial({color:0xc2a984,roughness:1});
  const roof = new THREE.MeshStandardMaterial({color:0x50352e,roughness:.95});
  const glow = new THREE.MeshStandardMaterial({color:0xffa54a,emissive:0xff6a15,emissiveIntensity:.6});
  const dockGeo = new THREE.BoxGeometry(2,.3,12);
  const postGeo = new THREE.CylinderGeometry(.15,.2,2,6);
  const wallGeo = new THREE.BoxGeometry(4,3,3);
  const roofGeo = new THREE.ConeGeometry(3.3,2,4);
  const lampGeo = new THREE.SphereGeometry(.22,8,6);
  const add=(geo,mat,x,y,z,parent=group)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;};
  // Local origin is the existing island center. Dock reaches seaward toward negative Z.
  for(let i=0;i<3;i++)add(dockGeo,wood,-1.5+i*1.8,1.1,-11);
  for(const x of [-2.5,2.5])for(const z of [-16,-9,-4])add(postGeo,wood,x,.65,z);
  for(const [x,z,scale] of [[-5,3,1],[5,4,.85],[0,8,.7]]) {
    const house=new THREE.Group();house.position.set(x,2,z);house.scale.setScalar(scale);group.add(house);
    add(wallGeo,plaster,0,1.5,0,house);
    const r=add(roofGeo,roof,0,3.9,0,house);r.rotation.y=Math.PI/4;
    add(new THREE.BoxGeometry(.9,1.5,.12),wood,0,.75,-1.57,house);
  }
  for(const [x,z] of [[-2,-14],[2,-8],[-4,5],[4,6]]) {
    add(postGeo,wood,x,1,z);
    add(lampGeo,glow,x,2.1,z);
  }
  return group;
}
