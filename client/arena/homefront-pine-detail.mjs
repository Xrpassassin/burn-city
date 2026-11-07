import { PINE_CROSSING_TREES, PINE_CROSSING_BUILDINGS, PINE_CREEK, pineRouteDistance } from './homefront-pine-crossing.mjs';
import { vehicleCorridorAt } from './homefront-vehicle-corridors.mjs';

// Original deterministic bark, not a downloaded asset or runtime dependency.
// Shared 128x256 colour/normal maps keep the woodland's texture cost bounded.
export function pineBarkPixels(){
 const width=128,height=256,relief=new Float32Array(width*height);
 const color=new Uint8Array(width*height*4),normal=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width*Math.PI*2,v=y/height*Math.PI*2;
  const seam=Math.pow((Math.sin(u*21+Math.sin(v*3)*0.65)+1)/2,10);
  const grain=Math.sin(u*47+v*11)*Math.cos(v*37-u*3);
  const plate=Math.sin(u*8+Math.sin(v*5))*0.09+Math.cos(v*9+u*2)*0.05;
  const h=relief[y*width+x]=0.58+plate-seam*0.36+grain*0.04;
  const i=(y*width+x)*4;
  color[i]=56+h*69;color[i+1]=53+h*57;color[i+2]=46+h*43;color[i+3]=255;
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=(xx,yy)=>relief[((yy+height)%height)*width+(xx+width)%width];
  const dx=(at(x-1,y)-at(x+1,y))*1.7,dy=(at(x,y-1)-at(x,y+1))*1.7;
  const length=Math.hypot(dx,dy,1),i=(y*width+x)*4;
  normal[i]=(dx/length*0.5+0.5)*255;normal[i+1]=(dy/length*0.5+0.5)*255;
  normal[i+2]=(1/length*0.5+0.5)*255;normal[i+3]=255;
 }
 return {width,height,color,normal};
}

export function createPineBarkMaterial(THREE){
 const data=pineBarkPixels();
 const map=new THREE.DataTexture(data.color,data.width,data.height,THREE.RGBAFormat);
 const normalMap=new THREE.DataTexture(data.normal,data.width,data.height,THREE.RGBAFormat);
 for(const texture of [map,normalMap]){
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=2;texture.needsUpdate=true;
 }
 map.colorSpace=THREE.SRGBColorSpace;
 const material=new THREE.MeshStandardMaterial({map,normalMap,normalScale:new THREE.Vector2(0.45,0.45),roughness:0.98});
 material.name='pine-fissured-bark';
 return material;
}

export function pineUnderstorySites(){
 const sites=[];
 for(const tree of PINE_CROSSING_TREES)for(let i=0;i<3;i++){
  const angle=tree.variation*19+i*2.4,radius=1.2+i*0.53;
  const x=tree.x+Math.cos(angle)*radius,z=tree.z+Math.sin(angle)*radius;
  // These low, non-solid plants belong to the forest floor, not travel lanes.
  if(pineRouteDistance(x,z)<0.85||vehicleCorridorAt(x,z))continue;
  if(PINE_CROSSING_BUILDINGS.some(b=>x>=b.x-3.2&&x<=b.x+8&&z>=b.z-3.2&&z<=b.z+3.2))continue;
  let wet=false;
  for(let j=1;j<PINE_CREEK.length;j++){
    const [ax,az]=PINE_CREEK[j-1],[bx,bz]=PINE_CREEK[j],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    if(Math.hypot(x-ax-t*dx,z-az-t*dz)<1.55){wet=true;break;}
  }
  if(wet)continue;
  sites.push({x,z,yaw:angle,scale:0.58+tree.variation*0.55});
 }
 return sites;
}

export function fernGeometry(THREE){
 const vertices=[],colors=[];
 for(let frond=0;frond<4;frond++){
  const angle=frond*Math.PI*2/4,dx=Math.cos(angle),dz=Math.sin(angle);
  for(let leaf=1;leaf<=4;leaf++){
   const t=leaf/5,reach=t*0.48,y=Math.sin(t*Math.PI*0.8)*0.48;
   const width=(1-t)*0.2;
   const previous=(leaf-1)/5,px=dx*previous*0.48,pz=dz*previous*0.48,py=Math.sin(previous*Math.PI*0.8)*0.48;
   const x=dx*reach,z=dz*reach;
   vertices.push(px-dz*0.008,py,pz+dx*0.008,px+dz*0.008,py,pz-dx*0.008,x,y,z,
     x,y,z,x-dz*0.008,y,z+dx*0.008,px-dz*0.008,py,pz+dx*0.008);
   for(let v=0;v<6;v++)colors.push(0.16,0.24,0.10);
   for(const side of [-1,1]){
    vertices.push(dx*reach,y,dz*reach,dx*(reach+0.10),y+0.025,dz*(reach+0.10),
     dx*reach-dz*width*side,y-0.025,dz*reach+dx*width*side);
    const shade=0.55+leaf*0.07;
    for(let v=0;v<3;v++)colors.push(0.29*shade,0.40*shade,0.19*shade);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();return geometry;
}

export function weatherWall(THREE,mesh){
 const p=mesh.geometry.attributes.position,colors=[];
 let min=Infinity,max=-Infinity;
 for(let i=0;i<p.count;i++){min=Math.min(min,p.getY(i));max=Math.max(max,p.getY(i));}
 for(let i=0;i<p.count;i++){
  const height=(p.getY(i)-min)/Math.max(0.01,max-min),shade=0.59+height*0.38;
  colors.push(shade*0.92,shade,shade*0.86);
 }
 mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 mesh.material.vertexColors=true;
}
