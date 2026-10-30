// Deterministic software projection of the real procedural house geometry.
// This comparison does not simulate WebGL lighting, shadows, or mobile frame rate.
import {registerHooks} from 'node:module';
import fs from 'node:fs/promises';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:new URL('../client/vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
const THREE=await import('three');
const {renderEstateHouses}=await import('../client/js/estates-house-design.mjs');
const sharp=(await import('sharp')).default;
const stages=['Homestead','Garden','Crafted','Signature','Grand','Landmark'],prices=['Purchase','15 XRP total','75 XRP total','150 XRP total','300 XRP total','600 XRP total'];
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1050" viewBox="0 0 1536 1050"><rect width="1536" height="1050" fill="#101a24"/><text x="40" y="53" font-family="sans-serif" font-size="30" fill="#ffdb9e" font-weight="bold">BURN CITY · A home that grows with you</text><text x="40" y="86" font-family="sans-serif" font-size="17" fill="#c5cfce">Same starter home · six cumulative cosmetic finishes · purchase counts toward progression</text>';
for(let level=0;level<6;level++){
 const x=24+(level%3)*504,y=115+Math.floor(level/3)*450;
 svg+=`<rect x="${x}" y="${y}" width="480" height="422" rx="15" fill="#202e38" stroke="#52616a"/><text x="${x+24}" y="${y+36}" font-family="sans-serif" font-size="23" fill="#ffe2af" font-weight="bold">${stages[level]}</text><text x="${x+24}" y="${y+63}" font-family="sans-serif" font-size="16" fill="#afbebd">${prices[level]}</text>`;
 const group=new THREE.Group();renderEstateHouses(THREE,group,[{id:'sample',tier:'starter',prestigeLevel:level,position:{x:0,y:0,z:0},buildingFootprint:{width:8,depth:7,height:5}}]);
 const ground=new THREE.Mesh(new THREE.BoxGeometry(9,.15,8),new THREE.MeshStandardMaterial({color:0x586d4c}));ground.position.y=-.12;group.add(ground);group.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera(37,480/330,.1,100);camera.position.set(11,8.5,14);camera.lookAt(0,2.2,0);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
 const projected=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 const width=480,height=330,pixels=Buffer.alloc(width*height*4),depths=new Float32Array(width*height).fill(Infinity);
 for(let i=0;i<width*height;i++){pixels[i*4]=32;pixels[i*4+1]=46;pixels[i*4+2]=56;pixels[i*4+3]=255;}
 const light=new THREE.Vector3(-.5,1,.7).normalize();
 group.traverse(mesh=>{if(!mesh.isMesh)return;const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
  for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++){
   const local=new THREE.Matrix4();if(mesh.isInstancedMesh)mesh.getMatrixAt(instance,local);const world=new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld,local);
   const count=index?index.count:position.count;
   for(let i=0;i<count;i+=3){const vertices=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(position,index?index.getX(i+k):i+k).applyMatrix4(world));
    const normal=new THREE.Vector3().subVectors(vertices[1],vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2],vertices[0])).normalize();
    if(normal.dot(new THREE.Vector3().subVectors(camera.position,vertices[0]))<=0)continue;
    const projectedVertices=vertices.map(v=>v.clone().applyMatrix4(projected));
    const [a,b,c]=projectedVertices.map(v=>({x:240+v.x*240,y:165-v.y*165,z:v.z}));
    const det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<.0001)continue;
    const color=mesh.material.color.clone().multiplyScalar(.66+.42*Math.max(0,normal.dot(light))).convertLinearToSRGB();
    const rgb=[color.r,color.g,color.b].map(n=>Math.min(255,Math.round(n*255)));
    const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),maxX=Math.min(width-1,Math.ceil(Math.max(a.x,b.x,c.x)));
    const minY=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),maxY=Math.min(height-1,Math.ceil(Math.max(a.y,b.y,c.y)));
    for(let py=minY;py<=maxY;py++)for(let px=minX;px<=maxX;px++){
      const u=((b.y-c.y)*(px+.5-c.x)+(c.x-b.x)*(py+.5-c.y))/det;
      const v=((c.y-a.y)*(px+.5-c.x)+(a.x-c.x)*(py+.5-c.y))/det,w=1-u-v;
      if(u<-.000001||v<-.000001||w<-.000001)continue;
      const depth=u*a.z+v*b.z+w*c.z,index=py*width+px;
      if(depth>=depths[index])continue;depths[index]=depth;
      pixels[index*4]=rgb[0];pixels[index*4+1]=rgb[1];pixels[index*4+2]=rgb[2];
    }
   }
  }
 });
 const png=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
 svg+=`<image x="${x}" y="${y+77}" width="480" height="330" href="data:image/png;base64,${png.toString('base64')}"/>`;
 svg+=`<text x="${x+24}" y="${y+393}" font-family="sans-serif" font-size="14" fill="#c5cfce">${['Original design','Flower boxes and planting','Shutters and stone trim','Copper accents and lanterns','Pergola and columns','Ivory facade and gold inlay'][level]}</text>`;
}
svg+='<text x="40" y="1040" font-family="sans-serif" font-size="14" fill="#93a6ac">Geometry comparison; in-game lighting differs. Cosmetic finishes keep the same property size and reward share units.</text></svg>';
await fs.mkdir(new URL('../previews/estates/',import.meta.url),{recursive:true});
await sharp(Buffer.from(svg)).png().toFile(new URL('../previews/estates/prestige-stages.png',import.meta.url).pathname);
console.log('Rendered six-stage house geometry comparison');
