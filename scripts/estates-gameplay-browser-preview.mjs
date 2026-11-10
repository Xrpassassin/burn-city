// Real Chromium WebGL render of the actual Estates Three.js modules on the PR
// branch, plus actual public-island enter/exit. Entirely local DRY_RUN world:
// fabricated scene fixtures are NEVER written to the server or owner ledger.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const out='estates-gameplay-preview-output';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,
 args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--no-zygote']});
const outcomes=[];
try{
 for(const [label,width,height] of [['desktop',1365,768],['mobile-size',390,844]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,
   isMobile:label==='mobile-size',hasTouch:label==='mobile-size',serviceWorkers:'block'});
  const page=await context.newPage(),pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  const response=await page.goto('http://127.0.0.1:8080/?noguide=1&live=0&q=low&view=street',
   {waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(response?.status(),200);
  await page.waitForFunction(()=>window.__ready&&window.__city?.S&&window.__city?.R&&window.__estatesIslandLive?.manifest,null,{timeout:60000});
  // Real island admission and return, not synthetic wallet or entitlements.
  assert.equal(await page.evaluate(()=>window.__estatesIslandLive.enterFromCity()),true);
  await page.waitForFunction(()=>window.__estatesIslandLive?.active,null,{timeout:15000});
  assert.equal(await page.evaluate(()=>window.__estatesIslandLive.returnToCity()),true);
  await page.waitForFunction(()=>!window.__estatesIslandLive?.active,null,{timeout:5000});
  const setup=await page.evaluate(async()=>{
   const THREE=await import('three');
   const {renderEstateHouses}=await import('./js/estates-house-design.mjs');
   const {createEstateTycoonDecor}=await import('./js/estates-tycoon-decor.mjs');
   const {ESTATE_EXTERIOR_ITEM_IDS}=await import('./js/estates-tycoon-architecture.mjs');
   const {createEstateHelicopterWorld}=await import('./js/estates-helicopter-world.mjs');
   const {createEstatesSecretInteriorRenderer}=await import('./js/estates-secret-interior-renderer.mjs');
   const canvas=document.createElement('canvas');
   canvas.id='bcIsolatedEstatesQaCanvas';
   canvas.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:999999;background:#8aa9ba';
   document.body.appendChild(canvas);
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x8aa9ba);
   scene.fog=new THREE.FogExp2(0x8aa9ba,.0009);
   const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,600);
   const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
   renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight,false);
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
   const root=new THREE.Group();
   root.name='branch-only-architectural-visual-fixture';
   root.position.set(1850,8,-1200);scene.add(root);
   const specs=[['trailer',6,5,3],['apartment',7,8,10],['starter',8,7,5],
    ['family',10,9,6],['mansion',13,11,8]];
   const lots=specs.map(([tier,w,d,h],i)=>({
    id:'qa-'+tier,propertyId:'qa-'+tier,tier,position:{x:(i-2)*26,y:.15,z:0},
    dimensions:{width:20,depth:18},buildingFootprint:{width:w,depth:d,height:h}
   }));
   root.add(new THREE.AmbientLight(0xffffff,1.85));
   const sun=new THREE.DirectionalLight(0xffe8ce,2.2);sun.position.set(-20,45,35);root.add(sun);
   for(const lot of lots){
    const ground=new THREE.Mesh(new THREE.BoxGeometry(20,.15,18),
     new THREE.MeshStandardMaterial({color:0x506e49,roughness:1}));
    ground.position.set(lot.position.x,-.04,0);
    ground.name='qa-lot-ground-'+lot.tier;root.add(ground);
    const walk=new THREE.Mesh(new THREE.BoxGeometry(2.6,.09,7.5),
     new THREE.MeshStandardMaterial({color:0x898679,roughness:1}));
    walk.position.set(lot.position.x,.09,5.6);root.add(walk);
   }
   renderEstateHouses(THREE,root,lots);
   const decor=createEstateTycoonDecor({THREE,parent:root,lots});
   decor.setUpgrades(lots.map(l=>({propertyId:l.propertyId,unlockedItemIds:ESTATE_EXTERIOR_ITEM_IDS})));
   const heli=createEstateHelicopterWorld({THREE,parent:root,lots});
   heli.setVerified([{propertyId:'qa-family',unlockedItemIds:['estate-helicopter']},
    {propertyId:'qa-mansion',unlockedItemIds:['estate-helicopter']}]);
   const privateRoom=createEstatesSecretInteriorRenderer({THREE,scene,origin:{x:1875,y:8,z:-1110}});
   const installed=root.getObjectByName('estate-tycoon-verified-decorations');
   const visualParts=installed.children.reduce((n,g)=>n+(g.isInstancedMesh?g.count:g.children.length),0);
   const drawBatches=installed.children.length;
   const render=(target,offset)=>{
    camera.position.copy(target).add(new THREE.Vector3(...offset));
    camera.lookAt(target);camera.updateProjectionMatrix();renderer.render(scene,camera);
   };
   window.__estatesGameplayQA={THREE,scene,root,camera,renderer,lots,decor,heli,privateRoom,render};
   render(new THREE.Vector3(root.position.x,root.position.y+4,root.position.z),[36,25,60]);
   return {ready:!!window.__ready,glVersion:renderer.getContext().getParameter(renderer.getContext().VERSION),
    lotCount:lots.length,upgrades:ESTATE_EXTERIOR_ITEM_IDS.length,
    helicopterLots:heli.properties,props:visualParts,verifiedDrawBatches:drawBatches,
    renderedDrawCalls:renderer.info.render.calls};
  });
  assert.equal(setup.lotCount,5);
  assert.equal(setup.upgrades,17);
  assert.equal(setup.helicopterLots.length,2);
  assert(setup.props>350,'all five house tiers display substantial real upgrade geometry');
  assert(setup.verifiedDrawBatches<=17,'visible exterior details are batched by material');
  assert(setup.renderedDrawCalls>0,'an actual WebGL draw rendered the Estates branch scene');
  const canvas=page.locator('#bcIsolatedEstatesQaCanvas');
  for(const tier of ['trailer','apartment','starter','family','mansion']){
   await page.evaluate(tier=>{
    const {THREE,root,lots,render}=window.__estatesGameplayQA;
    const lot=lots.find(l=>l.tier===tier);
    const target=new THREE.Vector3(root.position.x+lot.position.x,root.position.y+2.8,root.position.z);
    const range=innerWidth<600?27:22;
    render(target,[range*.75,range*.57,range]);
   },tier);
   await canvas.screenshot({path:out+'/'+label+'-'+tier+'.png'});
  }
  await page.evaluate(()=>{
   const {THREE,root,lots,decor,render}=window.__estatesGameplayQA;
   decor.setUpgrades(lots.map(l=>({propertyId:l.propertyId,unlockedItemIds:l.tier==='starter'?
    ['porch-lights','privacy-fence','flower-garden','hidden-hatch']:
    ['porch-lights','privacy-fence','flower-garden','hidden-hatch','cozy-awning']})));
   if(!decor.previewUpgrade('qa-starter','cozy-awning'))throw Error('preview_failed');
   if(decor.previewRoot.children.length!==1)throw Error('unverified_preview_not_isolated');
   const starter=lots.find(l=>l.tier==='starter');
   render(new THREE.Vector3(root.position.x+starter.position.x,root.position.y+2.8,root.position.z),[13,12,22]);
  });
  await canvas.screenshot({path:out+'/'+label+'-nonowned-upgrade-preview.png'});
  await page.evaluate(()=>{
   const {THREE,root,privateRoom,decor,render}=window.__estatesGameplayQA;
   decor.clearUpgradePreview();root.visible=false;privateRoom.setRoom('bunker');
   render(new THREE.Vector3(1875,9.8,-1110),[5,2.5,5.8]);
  });
  await canvas.screenshot({path:out+'/'+label+'-bunker-interior.png'});
  const final=await page.evaluate(()=>{
   const qa=window.__estatesGameplayQA;
   const {renderer}=qa,gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let readable=0,bright=0;
   for(let i=0;i<pixels.length;i+=4){
    const mean=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
    if(mean>35)readable++;
    if(mean>70)bright++;
   }
   const total=pixels.length/4;
   return {bunkerVisible:qa.privateRoom.root.visible,
    roomName:qa.privateRoom.layout?.roomId,
    roomGeometry:qa.privateRoom.root.children.length,
    readableFraction:readable/total,brightFraction:bright/total,
    renderedDrawCalls:qa.renderer.info.render.calls};
  });
  assert.equal(final.roomName,'bunker');
  assert(final.bunkerVisible&&final.roomGeometry>10);
  assert(final.readableFraction>.15,
   'private bunker may not render almost entirely black; real room surfaces must remain visible');
  assert(final.renderedDrawCalls>0,'3D private room must have visible geometry');
  assert.deepEqual(pageErrors,[],'no unhandled errors in isolated gameplay browser');
  outcomes.push({label,...setup,...final,pageErrors});
  await page.evaluate(()=>{
   const qa=window.__estatesGameplayQA;
   qa.decor.dispose();qa.heli.dispose();qa.privateRoom.dispose();
   qa.scene.remove(qa.root);qa.renderer.dispose();qa.renderer.domElement.remove();
  });
  await context.close();
 }
 writeFileSync(out+'/report.json',JSON.stringify(outcomes,null,2));
 console.log('Estates branch gameplay WebGL visual smoke passed',JSON.stringify(outcomes));
}finally{await browser.close();}
