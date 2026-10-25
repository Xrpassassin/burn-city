// Optional, license-reviewed GLB replacements for Estates blockouts.
// The host supplies its existing GLTFLoader; this module never downloads unknown assets.
const TIERS = new Set(['starter','mansion']);
const LOCAL_GLB = /^\.\/assets\/estates\/[a-z0-9/_-]+\.glb$/i;

export function validateEstateModelRegistry(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) throw new TypeError('Estate model registry must be an object');
  const validated = {};
  for (const [tier, entry] of Object.entries(registry)) {
    if (!TIERS.has(tier)) throw new Error('Unsupported pilot estate tier: '+tier);
    if (!entry || typeof entry !== 'object' || !LOCAL_GLB.test(entry.url ?? '')) throw new Error('Estate model must use a local reviewed GLB');
    if (typeof entry.license !== 'string' || !entry.license.trim() || typeof entry.attribution !== 'string' || !entry.attribution.trim()) {
      throw new Error('Estate model requires recorded license and attribution');
    }
    validated[tier] = Object.freeze({url:entry.url,license:entry.license,attribution:entry.attribution});
  }
  return Object.freeze(validated);
}

export async function installEstateModelPilot({THREE,root,manifest,loader,registry={},onStatus=()=>{}}={}) {
  if (!THREE?.Box3 || !THREE?.Vector3 || !root?.add || !Array.isArray(manifest?.lots) || typeof loader?.loadAsync !== 'function') {
    throw new TypeError('Estate model pilot requires Three.js, island root, lots and GLTFLoader');
  }
  const models=validateEstateModelRegistry(registry);
  const installed=[];
  let disposed=false;
  for(const lot of manifest.lots) {
    const entry=models[lot.tier];
    if(!entry || !lot.buildingFootprint) continue;
    try {
      const gltf=await loader.loadAsync(entry.url);
      const model=gltf?.scene;
      if(!model?.traverse || !model?.scale || !model?.position) throw new Error('GLB has no usable scene');
      if(disposed) break;
      const bounds=new THREE.Box3().setFromObject(model);
      const size=bounds.getSize(new THREE.Vector3());
      if(!Number.isFinite(size.x)||!Number.isFinite(size.y)||!Number.isFinite(size.z)||Math.min(size.x,size.y,size.z)<=0) throw new Error('GLB bounds invalid');
      const f=lot.buildingFootprint;
      const scale=Math.min(f.width/size.x,f.height/size.y,f.depth/size.z);
      model.scale.multiplyScalar(scale);
      const fitted=new THREE.Box3().setFromObject(model);
      const center=fitted.getCenter(new THREE.Vector3());
      model.position.set(lot.position.x-center.x,lot.position.y-fitted.min.y,lot.position.z-center.z);
      model.name=lot.id+'-reviewed-model';
      // Hide only the original structural blockout. Retain landscaping, doors and lot markers
      // until the approved model's silhouette and attachment compatibility are reviewed.
      const blockout=root.getObjectByName(lot.id+'-building-blockout');
      const roof=root.getObjectByName(lot.id+'-roof-blockout');
      const previous=[blockout,roof].filter(Boolean).map(mesh=>({mesh,visible:mesh.visible}));
      for(const p of previous)p.mesh.visible=false;
      root.add(model);
      installed.push({model,previous});
      onStatus({lotId:lot.id,state:'model-loaded',url:entry.url});
    } catch(error) {
      onStatus({lotId:lot.id,state:'fallback-blockout',reason:String(error?.message||error)});
    }
  }
  return Object.freeze({
    get installedCount(){return installed.length;},
    dispose(){
      if(disposed)return false;
      disposed=true;
      for(const {model,previous} of installed) {
        root.remove(model);
        for(const p of previous)p.mesh.visible=p.visible;
        // Loader caches may share geometries/materials across instances; host owns their disposal.
      }
      installed.length=0;
      return true;
    }
  });
}
