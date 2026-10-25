// Low-poly tavern interior staged within the Cinder Cove house nearest the dock.
// Shared materials and simple geometry; no external assets or audio licenses.
export function buildCoveTavern(THREE) {
 const room=new THREE.Group();room.position.set(-61,2,-81);room.name='cinder-cove-tavern';
 const timber=new THREE.MeshStandardMaterial({color:0x56351f,roughness:1});
 const floorMat=new THREE.MeshStandardMaterial({color:0x86613b,roughness:1});
 const amber=new THREE.MeshStandardMaterial({color:0xffb75b,emissive:0xb95c17,emissiveIntensity:.55});
 const wall=new THREE.MeshStandardMaterial({color:0x998368,roughness:1,side:THREE.DoubleSide});
 const add=(w,h,d,x,y,z,mat,parent=room)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;};
 add(9,.2,9,0,-.15,0,floorMat);
 // Open doorway on south wall; walls intentionally simplified for walk-through preview.
 add(3,3,.25,-3,1.5,-4.5,wall);add(3,3,.25,3,1.5,-4.5,wall);
 add(9,3,.25,0,1.5,4.5,wall);add(.25,3,9,-4.5,1.5,0,wall);add(.25,3,9,4.5,1.5,0,wall);
 add(6,1,1.1,0,.55,2.8,timber);
 for(const x of [-2.4,2.4]){add(1.5,.15,1.5,x,.8,-1,timber);for(const z of [-1.9,-.1])add(.65,.65,.65,x,.35,z,timber);}
 for(const x of [-3.5,3.5]){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),amber);lamp.position.set(x,2.4,3.5);room.add(lamp);}
 const npc=new THREE.Group();const coat=new THREE.MeshStandardMaterial({color:0x3d4c48,roughness:1});
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.8,4,8),coat);body.position.y=1.25;npc.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.29,8,7),floorMat);head.position.y=2.08;npc.add(head);
 npc.position.set(0,0,2.1);room.add(npc);
 room.visible=false;return {room,npc};
}
