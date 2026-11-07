// Locally bundled CC0 Poly Haven scans. Geometry/collision stays authoritative;
// normal maps add surface relief without displacement or extra draw calls.
export const SURFACE_PACK=Object.freeze({
 soil:{asset:'forest_ground_04',metres:3.15,relief:0.38},
 asphalt:{asset:'asphalt_02',metres:3,relief:0.28},
 concrete:{asset:'concrete_wall_006',metres:2,relief:0.32}
});

export function worldSurfaceUVs(THREE,geometry,metres){
 const p=geometry.attributes.position,n=geometry.attributes.normal;
 const uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++){
  const nx=Math.abs(n?.getX(i)||0),ny=Math.abs(n?.getY(i)||0);
  // Dominant-face projection preserves texel size on differently sized boxes.
  // Horizontal ribbons use world XZ coordinates, including curved roads.
  uv[i*2]=(nx>0.5?p.getZ(i):p.getX(i))/metres;
  uv[i*2+1]=(ny>0.5?p.getZ(i):p.getY(i))/metres;
 }
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 return geometry;
}

export function createHomefrontSurfaces(THREE,renderer,{mobile=false}={}){
 const loader=new THREE.TextureLoader(),cache=new Map();
 const anisotropy=Math.min(mobile?2:4,renderer.capabilities.getMaxAnisotropy());
 function material(kind,options={}){
  const spec=SURFACE_PACK[kind];
  if(!spec)throw Error('Unknown Homefront surface: '+kind);
  let entry=cache.get(kind);
  if(!entry){
   entry={maps:{},materials:[]};cache.set(kind,entry);
   for(const [slot,suffix]of [['map','color'],['normalMap','normal'],['roughnessMap','roughness']]){
    const texture=loader.load(new URL('./assets/homefront/surfaces/'+spec.asset+'-'+suffix+'.webp',import.meta.url).href,
      ()=>{texture.userData.loaded=true;},undefined,()=>{
       // A missing file keeps the existing flat material playable.
       texture.userData.failed=true;
       for(const mat of entry.materials){mat[slot]=null;mat.needsUpdate=true;}
      });
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.colorSpace=slot==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.anisotropy=anisotropy;
    texture.userData.homefrontSurface=kind;
    entry.maps[slot]=texture;
   }
  }
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,
   ...entry.maps,normalScale:new THREE.Vector2(spec.relief,spec.relief),...options});
  for(const slot of Object.keys(entry.maps))if(entry.maps[slot].userData.failed)mat[slot]=null;
  mat.name='homefront-surface:'+kind;
  mat.userData.homefrontTileMetres=spec.metres;
  entry.materials.push(mat);
  return mat;
 }
 return {material};
}
