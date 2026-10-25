// Original, low-poly character kit. Geometry is shared per scene; no external assets.
export const TAVERN_CAST=Object.freeze([
 {id:'silas-reed',name:'Silas Reed',role:'Keeper',coat:0x344b43,skin:0xb78967,hair:0x34302b,hat:true,beard:true,x:0,z:2.1},
 {id:'brann-hook',name:'Brann Hook',role:'Sailor',coat:0x4e5067,skin:0xa96e4c,hair:0x211b1b,hat:false,beard:true,x:-3.2,z:.5},
 {id:'ivana-quill',name:'Ivana Quill',role:'Cartographer',coat:0x65445b,skin:0xc79779,hair:0x39221d,hat:false,beard:false,x:3.2,z:.4}
]);
export function createTavernCharacter(THREE,profile) {
 const group=new THREE.Group();group.name='npc-'+profile.id;
 const material=color=>new THREE.MeshStandardMaterial({color,roughness:.92});
 const coat=material(profile.coat),skin=material(profile.skin),hair=material(profile.hair);
 const boot=material(0x251c19),metal=material(0x967b52);
 const add=(geometry,mat,x,y,z,parent=group)=>{const mesh=new THREE.Mesh(geometry,mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
 const torso=add(new THREE.CylinderGeometry(.34,.43,.95,9),coat,0,1.18,0);
 add(new THREE.SphereGeometry(.27,10,8),skin,0,1.98,0);
 for(const side of [-1,1]) {
  const arm=add(new THREE.CapsuleGeometry(.12,.55,3,6),coat,side*.46,1.18,0);arm.rotation.z=side*.15;
  add(new THREE.CylinderGeometry(.14,.15,.73,7),boot,side*.17,.39,0);
 }
 add(new THREE.BoxGeometry(.18,.12,.1),metal,0,1.02,-.37);
 const haircap=add(new THREE.SphereGeometry(.277,10,6,0,Math.PI*2,0,Math.PI*.43),hair,0,2.01,0);
 if(profile.hat){
  add(new THREE.CylinderGeometry(.33,.32,.25,10),boot,0,2.31,0);
  add(new THREE.CylinderGeometry(.48,.48,.045,12),boot,0,2.18,0);
 }
 if(profile.beard)add(new THREE.ConeGeometry(.2,.3,8),hair,0,1.69,-.12);
 group.position.set(profile.x,0,profile.z);
 return {group,torso,haircap};
}
export function populateTavern(THREE,room){
 return TAVERN_CAST.map(profile=>{const model=createTavernCharacter(THREE,profile);room.add(model.group);return {...model,id:profile.id};});
}
