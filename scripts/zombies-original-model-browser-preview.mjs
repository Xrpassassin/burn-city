// Render the original Zombies mode's OWN procedural fallback and licensed
// human, hazmat and thin infected CC-BY zombies in an isolated real WebGL test. Never starts gameplay,
// touches Homefront, wallet, purchases or server combat data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const requirePlaywright=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/package.json');
const {chromium,webkit}=requirePlaywright('playwright');
const engine=process.env.ZOMBIE_QA_BROWSER==='webkit'?webkit:chromium;
const tag=process.env.ZOMBIE_QA_BROWSER||'chromium',out=process.env.ZOMBIE_QA_OUTPUT||'zombie-arena-art-output';
await mkdir(out,{recursive:true});
const browser=await engine.launch({headless:true,args:tag==='webkit'?[]:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const failures=[],results=[];
try{
 for(const view of [
  {name:'desktop',width:1280,height:760,mobile:false},
  {name:'mobile',width:390,height:844,mobile:true}
 ]){
  const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1,
    isMobile:view.mobile,hasTouch:view.mobile});
  const page=await ctx.newPage();
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/i.test(m.text()))failures.push(m.text())});
  await page.goto('http://127.0.0.1:8080/arena/index.html?zombieModels=0',{waitUntil:'domcontentloaded',timeout:45000});
  const init=await page.evaluate(async()=>{
   const THREE=await import('./vendor/three.module.min.js');
   const {createZombieRenderer}=await import('./fx.js');
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x354048);
   const hemi=new THREE.HemisphereLight(0xffe8cc,0x222b35,1.9);scene.add(hemi);
   const sun=new THREE.DirectionalLight(0xffd9b1,2);sun.position.set(-5,14,9);scene.add(sun);
   const ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:0x454640,roughness:1}));
   ground.rotation.x=-Math.PI/2;ground.position.y=-.13;scene.add(ground);
   const gl=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
   gl.setPixelRatio(1);gl.setSize(innerWidth,innerHeight,false);
   gl.domElement.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;display:block;background:#354048';
   document.body.append(gl.domElement);
   const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,350);
   camera.position.set(0,5,15);camera.lookAt(0,1,0);
   const infected=createZombieRenderer(scene,{low:false,deathOnRemoval:false});
   const zombies=Array.from({length:9},(_,i)=>({id:'arena-original-'+i,ty:i,
    x:(i%3-1)*2.7,z:(Math.floor(i/3)-1)*2.1,yaw:0,seed:i+1,v:1,speed:0,
    cr:i===5,preparing:false,ch:false,stagger:0,hpFrac:1}));
   infected.update(.016,zombies,{x:0,z:6});
   gl.render(scene,camera);
   const count=scene.children.filter(x=>x.isInstancedMesh).length;
   window.__zombieQA={THREE,scene,camera,gl,infected,zombies,ground};
   return {instancedMeshes:count,actors:zombies.length,drawCalls:gl.info.render.calls,
    width:gl.domElement.width,height:gl.domElement.height,
    geometry:scene.children.filter(x=>x.isInstancedMesh).map(x=>x.geometry?.getAttribute('position')?.count||0)};
  });
  assert.equal(init.actors,9);
  assert(init.instancedMeshes>=10,'original Zombies must retain its efficient instanced horde');
  assert(init.geometry.some(x=>x>24),'procedural characters have smoothly subdivided humanoid parts');
  assert(init.drawCalls>0&&init.drawCalls<110,'procedural horde preserves safe draw call count');
  await page.screenshot({path:out+'/'+tag+'-'+view.name+'-arena-original-fallback.png',fullPage:false});
  const detailed=await page.evaluate(async()=>{
   const {THREE,scene,camera,gl,infected,ground}=window.__zombieQA;
   infected.clear();
   // Keep the preview readable: no duplicate procedural models or game UI.
   const instanced=scene.children.filter(x=>x.isInstancedMesh);
   for(const obj of instanced)scene.remove(obj);
   const {createZombieModelPilot}=await import('./zombie-model-pilot.mjs');
   const pilot=await createZombieModelPilot(scene,{maxModels:8,maxDistance:120,targetHeight:1.72,distantLOD:false});
   const zombies=Array.from({length:8},(_,i)=>({id:'original-bundled-'+i,ty:i,
    x:(i%4-1.5)*2.3,z:Math.floor(i/4)*-3,y:0,yaw:0,v:1,speed:0,
    ch:false,cr:false}));
   const modeled=pilot.update(zombies,.016,{x:0,z:6});
   camera.position.set(0,4,13);camera.lookAt(0,1.2,0);
   gl.render(scene,camera);
   let skinned=0,meshes=0,textured=0;
   scene.traverse(obj=>{if(obj.isSkinnedMesh)skinned++;if(obj.isMesh){
    meshes++;const mats=Array.isArray(obj.material)?obj.material:[obj.material];
    if(mats.some(m=>m?.map||m?.normalMap))textured++;
   }});
   const cast=scene.children.filter(obj=>obj.userData?.infectedAssetId).map(obj=>obj.userData.infectedAssetId);
   const actorBounds=scene.children.filter(obj=>obj.userData?.infectedAssetId).map(obj=>{
     const box=new THREE.Box3().setFromObject(obj,true);
     const size=box.getSize(new THREE.Vector3());
     const centre=box.getCenter(new THREE.Vector3());
     return {asset:obj.userData.infectedAssetId,height:+size.y.toFixed(2),width:+size.x.toFixed(2),
       depth:+size.z.toFixed(2),center:centre.toArray().map(x=>+x.toFixed(2)),scale:obj.scale.x};
   });
   window.__zombieQA.pilot=pilot;
   const hitAiden=pilot.react('original-bundled-0','HitReact');
   const hitHazmat=pilot.react('original-bundled-3','HitReact');
   const deathThin=pilot.react('original-bundled-1','Death');
   pilot.update(zombies,.016,{x:0,z:6});gl.render(scene,camera);
   return {modeled:modeled.size,skinned,meshes,textured,cast,actorBounds,hitAiden,hitHazmat,deathThin,
    drawCalls:gl.info.render.calls};
  });
  assert.equal(detailed.modeled,8,'all nearby Zombies should show the new realistic assets, not blocky fallbacks');
  assert(detailed.skinned>=8,'preview uses real skinned animated humans, not generic fake capsule models');
  assert(detailed.textured>=8,'each detailed character uses real material textures');
  assert.deepEqual(new Set(detailed.cast),new Set(['human','hazmat','thin']),'all three verified CC-BY casts appear');
  assert(detailed.hitAiden&&detailed.hitHazmat&&detailed.deathThin,'missing hit/death clips get visual fallback, not lost reactions');
  assert(detailed.drawCalls>0&&detailed.drawCalls<350);
  console.log('ZOMBIE_MODEL_BOUNDS '+tag+' '+view.name+' '+JSON.stringify(detailed.actorBounds));
  for(const actor of detailed.actorBounds) {
    assert(actor.height>.6&&actor.height<5.5,'actor '+actor.asset+' height is implausible: '+actor.height);
    assert(actor.width<5&&actor.depth<5,'actor '+actor.asset+' has implausible warped limbs');
  }
  await page.screenshot({path:out+'/'+tag+'-'+view.name+'-sketchfab-infected.png',fullPage:false});
  const solo=[];
  for(const variant of ['human','hazmat','thin']){
    const details=await page.evaluate(type=>{
      const {THREE,scene,camera,gl}=window.__zombieQA;
      const groups=scene.children.filter(x=>x.userData?.infectedAssetId);
      const subject=groups.find(x=>x.userData.infectedAssetId===type);
      if(!subject)return null;
      for(const g of groups)g.visible=(g===subject);
      const box=new THREE.Box3().setFromObject(subject,true);
      const size=box.getSize(new THREE.Vector3()),centre=box.getCenter(new THREE.Vector3());
      const radius=Math.max(size.x,size.y,size.z);
      camera.position.set(centre.x+radius*.20,centre.y+radius*.13,centre.z+radius*1.75);
      camera.lookAt(centre);
      camera.near=.05;camera.far=500;camera.updateProjectionMatrix();gl.render(scene,camera);
      return {asset:type,size:size.toArray().map(x=>+x.toFixed(3)),centre:centre.toArray().map(x=>+x.toFixed(3))};
    },variant);
    assert.equal(details?.asset,variant,'missing isolated '+variant+' closeup');
    await page.screenshot({path:out+'/'+tag+'-'+view.name+'-'+variant+'-portrait.png',fullPage:false});
    solo.push(details);
  }
  // More than eight visible enemies used to fall back to Roblox-looking
  // primitive bodies. Verify the REAL human/hazmat/thin GLB skin is baked
  // into inexpensive textured InstancedMeshes for the distant horde.
  const distant=await page.evaluate(()=>{
    const {THREE,scene,camera,gl,pilot}=window.__zombieQA;
    for(const g of scene.children.filter(x=>x.userData?.infectedAssetId))g.visible=true;
    const near=Array.from({length:8},(_,i)=>({
      id:'original-bundled-'+i,ty:i,x:(i%4-1.5)*2.3,z:Math.floor(i/4)*-3,
      y:0,yaw:0,v:1,speed:0,ch:false,cr:false
    }));
    const far=Array.from({length:30},(_,i)=>({
      id:'textured-distant-'+i,ty:i%9,x:(i%10-4.5)*2.25,
      z:-9-Math.floor(i/10)*3,y:0,yaw:0,v:1,speed:0,
      ch:false,cr:false
    }));
    const drawn=pilot.update([...near,...far],.016,{x:0,z:6});
    const batches=scene.children.filter(x=>x.isInstancedMesh&&x.name.includes('distant textured infected'));
    const visible=batches.filter(x=>x.count>0);
    camera.position.set(0,7,17);camera.lookAt(0,1,-9);gl.render(scene,camera);
    return {expected:38,drawn:drawn.size,batches:batches.length,
      activeBatches:visible.length,instancedActors:Math.max(...batches.map(x=>x.count)),
      draws:gl.info.render.calls,
      containsTexturedBody:visible.some(x=>!!x.material?.map||!!x.material?.normalMap),
      poseGeometry:visible.some(x=>x.geometry?.attributes?.position?.count>1000)};
  });
  assert.equal(distant.drawn,distant.expected,'all 38 rendered enemies use licensed meshes; no boxy fallback');
  assert(distant.activeBatches>=3,'multiple GLB body/material batches should render');
  assert(distant.containsTexturedBody,'far zombie skin remains textured PBR, not flat placeholder');
  assert(distant.poseGeometry,'distant zombies use actual baked anatomical geometry');
  assert(distant.draws<150,'mobile and desktop instancing avoids dozens of costly skinned rigs');
  await page.screenshot({path:out+'/'+tag+'-'+view.name+'-38-real-zombie-horde.png',fullPage:false});
  results.push({view:view.name,fallback:init,animated:detailed,portraits:solo,distant});
  await ctx.close();
  continue;

 }
 assert.equal(failures.length,0,'no shader compilation errors');
 await writeFile(out+'/'+tag+'-report.json',JSON.stringify({results,failures},null,2));
 console.log(JSON.stringify({results,failures},null,2));
}finally{await browser.close()}
