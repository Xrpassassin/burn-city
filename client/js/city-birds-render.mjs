import * as THREE from 'three';
import {planBirdFlocks} from './city-birds-plan.mjs';
// Lightweight silhouettes only: one draw call, bounded animation and no scene collisions.
export function installCityBirds({scene,nodes,tier='medium',anim}) {
 const flocks=planBirdFlocks({nodes,tier});
 if(!flocks.length)return {count:0,dispose(){}};
 const material=new THREE.LineBasicMaterial({color:0x909fa8,transparent:true,opacity:.7,depthWrite:false});
 // Each bird is a shallow V of two wings (two line segments).
 const points=new Float32Array(flocks.length*12),g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(points,3));
 const lines=new THREE.LineSegments(g,material);lines.frustumCulled=false;scene.add(lines);
 let active=true,frames=0;
 const update=t=>{if(!active||(++frames%2))return;
  flocks.forEach((f,i)=>{const a=t*f.speed+f.phase,x=f.x+Math.cos(a)*f.radius,z=f.z+Math.sin(a)*f.radius,y=f.y+Math.sin(a*2)*.8;
   const flap=.36+.14*Math.sin(t*5+f.phase),o=i*12,s=f.size;
   points.set([x-s,y+flap,z,x,y,z,x,y,z,x+s,y+flap,z],o);
  });g.attributes.position.needsUpdate=true;};
 if(Array.isArray(anim))anim.push(update);
 return {count:flocks.length,dispose(){active=false;scene.remove(lines);g.dispose();material.dispose();if(Array.isArray(anim)){const i=anim.indexOf(update);if(i>=0)anim.splice(i,1)}}};
}
