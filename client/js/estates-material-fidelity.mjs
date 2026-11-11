// Deterministic, original material microdetail for BURN City Estates.
// No network textures, image assets, renderer-wide flags, or mutable random seeds.
// A small repeated GPU texture is shared by all instances of one material bucket.
// This is subtle PBR surface breakup, not a substitute for authored architecture.
const SURFACES=Object.freeze(new Set(['plaster','ivory','siding','stone','timber','wood','roof','slate',
 'frame','metal','earth','brass','copper']));
const checksum=(s)=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0;};
const lerp=(a,b,t)=>a+(b-a)*t;
const hash=(x,y,seed)=>{let n=(Math.imul(x+7,374761393)+Math.imul(y+11,668265263)+seed)>>>0;
 n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
export function estateSurfaceTexture(THREE,key){
 if(!SURFACES.has(key)||typeof THREE?.DataTexture!=='function')return null;
 const size=64, bytes=new Uint8Array(size*size*4),seed=checksum(key),isWood=key==='wood'||key==='timber',
  isRoof=key==='roof'||key==='slate',isStone=key==='stone',isSiding=key==='siding';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const grain=hash(Math.floor(x/3),Math.floor(y/3),seed),
   speckle=hash(x,y,seed^0x51ac),band=Math.sin(x*.72+grain*2);
  // Modulate whites rather than writing large color blocks. The actual PBR
  // material color still controls paint and tier identity.
  let shade=lerp(231,252,grain*.45+speckle*.55);
  if(isWood)shade-=Math.abs(band)*15+((y%13)<1?7:0);
  else if(isRoof)shade-=((x%18)<2?26:0)+Math.abs(Math.sin(y*.4))*5;
  else if(isStone)shade-=((y%21)<2||((x+Math.floor(y/21)*13)%29)<2?17:0);
  else if(isSiding)shade-=y%11<2?20:0;
  else shade-=speckle*10;
  const q=Math.max(170,Math.min(255,Math.round(shade))),index=(y*size+x)*4;
  bytes[index]=q;bytes[index+1]=q;bytes[index+2]=q;bytes[index+3]=255;
 }
 const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
 texture.name='estates-procedural-'+key;
 if(THREE.RepeatWrapping!==undefined){texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;}
 texture.repeat?.set?.(2,2);
 if(THREE.SRGBColorSpace!==undefined)texture.colorSpace=THREE.SRGBColorSpace;
 else if(THREE.sRGBEncoding!==undefined)texture.encoding=THREE.sRGBEncoding;
 texture.magFilter=THREE.LinearFilter??texture.magFilter;
 texture.minFilter=THREE.LinearMipmapLinearFilter??texture.minFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;
 return texture;
}
// Some Three versions need sRGB texture conversion, while non-browser test
// doubles do not support DataTexture. The caller always has a flat fallback.
export function estateSurfaceProperties(THREE,key){
 const texture=estateSurfaceTexture(THREE,key);
 return texture?{map:texture,bumpMap:texture,bumpScale:key==='stone'?.026:key==='wood'||key==='timber'?.018:.012}:{};
}
