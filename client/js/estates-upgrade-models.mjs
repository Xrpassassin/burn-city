// Optional authored models for the Estates Tycoon upgrades (CC BY 4.0
// Sketchfab sources, credited in client/city-credits.html and
// client/assets/estates-upgrades/CREDITS.md). Everything here is
// progressive enhancement: if three's GLTFLoader or any file is unavailable,
// the code-built primitives in estates-tycoon-architecture.mjs stay in place.
export const ESTATE_UPGRADE_MODEL_IDS=Object.freeze(['helicopter','fire-pit','camera','gnome','rocks','wall-lantern','flower-bush','workbench','arcade']);
const ASSETS=new URL('../assets/estates-upgrades/',import.meta.url);
// Materials whose authored colour is a light source get a matching emissive.
const SELF_LIT=/^(fire|blinn2)$/i;   // fire-pit flames, arcade screen sprites
let cache=null;
// Resolves to Map<modelId,{parts:Map<partName,[{geometry,material}]>,info}>.
// Never rejects: failed models are simply absent from the map.
export function loadEstateUpgradeModels(THREE,{ids=ESTATE_UPGRADE_MODEL_IDS,base=ASSETS,loader=null}={}){
 if(cache&&!loader)return cache;
 const run=(async()=>{
  const out=new Map();
  let gl=loader;
  if(!gl){
   try{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');gl=new GLTFLoader();}
   catch{return out;}
  }
  await Promise.all(ids.map(async id=>{
   try{
    const [gltf,info]=await Promise.all([gl.loadAsync(new URL(id+'.gltf',base).href),
     Promise.resolve().then(()=>fetch(new URL(id+'.json',base))).then(r=>r.ok?r.json():{}).catch(()=>({}))]);
    gltf.scene.updateMatrixWorld(true);
    const parts=new Map();
    gltf.scene.traverse(node=>{
     if(!node.isMesh)return;
     // Exported part meshes carry their part name (e.g. body, rotor, rock-a).
     let named=node;while(named.parent&&named.parent!==gltf.scene)named=named.parent;
     const part=named.name||node.name||'body';
     const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrixWorld);
     const material=node.material;
     if(material&&SELF_LIT.test(material.name||'')&&material.emissive){
      material.emissive.copy(material.color);material.emissiveIntensity=1.6;
     }
     if(material?.map&&THREE.SRGBColorSpace)material.map.colorSpace=THREE.SRGBColorSpace;
     if(!parts.has(part))parts.set(part,[]);
     parts.get(part).push({geometry,material});
    });
    if(parts.size)out.set(id,{parts,info});
   }catch{/* keep the primitive fallback for this item */}
  }));
  return out;
 })();
 if(!loader)cache=run;
 return run;
}
