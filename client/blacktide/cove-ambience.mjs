import { HARBOR_ROUTES, samplePatrol } from './harbor-patrol.mjs';
// Cinder Cove lightweight ambience. No extra dependencies or gameplay authority.
export function createCoveAmbience({THREE,scene}) {
 const group=new THREE.Group();group.position.set(-56,0,-84);scene.add(group);
 const cloth=new THREE.MeshStandardMaterial({color:0x49535b,roughness:1});
 const headMat=new THREE.MeshStandardMaterial({color:0xb78b69,roughness:1});
 const lanternMat=new THREE.MeshStandardMaterial({color:0xffb45b,emissive:0xff7a28,emissiveIntensity:.8});
 const bodyGeo=new THREE.CapsuleGeometry(.3,.65,3,6);
 const headGeo=new THREE.SphereGeometry(.22,7,6);
 const actors=[];
 for(const [x,z,phase] of [[-4,-8,0],[3,-5,1.9],[5,2,3.4]]) {
  const actor=new THREE.Group();
  const body=new THREE.Mesh(bodyGeo,cloth);body.position.y=1.1;actor.add(body);
  const head=new THREE.Mesh(headGeo,headMat);head.position.y=1.85;actor.add(head);
  actor.position.set(x,2.3,z);group.add(actor);
  actors.push({actor,x,z,phase});
 }
 const lanterns=[];
 for(const [x,z] of [[-2,-14],[2,-8],[-4,5],[4,6]]) {
  const flame=new THREE.Mesh(new THREE.SphereGeometry(.11,6,5),lanternMat);
  flame.position.set(x,2.2,z);group.add(flame);lanterns.push(flame);
 }
 const pennantMat=new THREE.MeshStandardMaterial({color:0x9b4635,side:THREE.DoubleSide,roughness:1});
 const pennants=[];
 for(const [x,z] of [[-3,-10],[3,-4],[0,7]]) {
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.55),pennantMat);
  flag.position.set(x,5,z);group.add(flag);pennants.push(flag);
 }
 group.visible=false;
 return {update(active,time){
   group.visible=!!active;if(!active)return;
   for(let i=0;i<actors.length;i++) {
    const {actor,phase}=actors[i];
    const point=samplePatrol(HARBOR_ROUTES[i],time*.75+phase);
    if(point){actor.position.x=point.x;actor.position.z=point.z;actor.rotation.y=point.heading;}
   }
   for(let i=0;i<lanterns.length;i++)lanterns[i].scale.setScalar(1+.12*Math.sin(time*3+i*1.7));
   for(let i=0;i<pennants.length;i++)pennants[i].rotation.y=.3*Math.sin(time*1.7+i);
 }};
}
