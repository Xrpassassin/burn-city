// Real Chromium WebGL render of the actual Estates Three.js modules on the PR
// branch, plus actual public-island enter/exit. Entirely local DRY_RUN world:
// fabricated scene fixtures are NEVER written to the server or owner ledger.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium,webkit}=require('playwright');
const engine=process.env.ESTATES_BROWSER==='webkit'?'webkit':'chromium';
const out=process.env.ESTATES_GAMEPLAY_OUTPUT||'estates-gameplay-preview-output';
mkdirSync(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,
 ...(engine==='chromium'?{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--no-zygote']}: {})});
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
   const {renderEstateHouses,estateHouseParts}=await import('./js/estates-house-design.mjs');
   const {createEstateTycoonDecor}=await import('./js/estates-tycoon-decor.mjs');
   const {createEstateNeighborhoodDecor}=await import('./js/estates-neighborhood-renderer.mjs');
   const {buildEstateNeighborhoodFurniture}=await import('./js/estates-neighborhood-data.mjs');
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
   // Exercise real, distinct free variants in five tier screenshots.
   const freeStyles=[
    {architecture:'rustic',palette:'forest'},
    {architecture:'classic',palette:'coastal'},
    {architecture:'modern',palette:'original'},
    {architecture:'rustic',palette:'charcoal'},
    {architecture:'modern',palette:'coastal'}
   ];
   const lots=specs.map(([tier,w,d,h],i)=>({
    id:'qa-'+tier,propertyId:'qa-'+tier,tier,position:{x:(i-2)*26,y:.15,z:0},
    dimensions:{width:20,depth:18},buildingFootprint:{width:w,depth:d,height:h},...freeStyles[i]
   }));
   const styleCoverage=new Set(lots.map(l=>l.architecture));
   const colorCoverage=new Set(lots.map(l=>l.palette));
   if(styleCoverage.size!==3||colorCoverage.size!==4)throw Error('estate_free_style_browser_coverage_missing');
   for(const lot of lots){
    if(!estateHouseParts(lot).some(p=>p.name.startsWith(lot.architecture+'-')))
     throw Error('estate_free_style_geometry_missing_'+lot.tier);
   }
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
   const neighborhood=createEstateNeighborhoodDecor({THREE,parent:root,manifest:{streetFurniture:buildEstateNeighborhoodFurniture(lots)}});
   if(neighborhood.drawBatches>13||neighborhood.fixtureCount<20)throw Error('neighborhood_fixture_render_contract');
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
     architecturalStyles:styleCoverage.size,exteriorPalettes:colorCoverage.size,
    helicopterLots:heli.properties,props:visualParts,verifiedDrawBatches:drawBatches,neighborhoodParts:neighborhood.partCount,neighborhoodDrawBatches:neighborhood.drawBatches,
    renderedDrawCalls:renderer.info.render.calls};
  });
  assert.equal(setup.lotCount,5);
   assert(setup.neighborhoodParts>=140);
   assert(setup.neighborhoodDrawBatches<=13);
   assert.equal(setup.architecturalStyles,3);
   assert.equal(setup.exteriorPalettes,4);
  assert.equal(setup.upgrades,17);
  assert.equal(setup.helicopterLots.length,2);
  assert(setup.props>350,'all five house tiers display substantial real upgrade geometry');
  assert(setup.verifiedDrawBatches<=17,'visible exterior details are batched by material');
  assert(setup.renderedDrawCalls>0,'an actual WebGL draw rendered the Estates branch scene');
  // A continuously updating game page makes Playwright locator.screenshot()
  // wait for impossible "element stability" on some GPU/browser combinations.
  // Read our isolated renderer's preserved WebGL drawing buffer directly.
  const capture=async filename=>{
   const base64=await page.evaluate(()=>window.__estatesGameplayQA.renderer.domElement.toDataURL('image/png').split(',')[1]);
   assert(base64.length>1000,'WebGL canvas did not produce a usable screenshot');
   writeFileSync(out+'/'+filename,Buffer.from(base64,'base64'));
  };
  await page.evaluate(()=>{
    const {THREE,root,render}=window.__estatesGameplayQA;
    const mobile=innerWidth<600;
    render(new THREE.Vector3(root.position.x,root.position.y+4,root.position.z),
      mobile?[0,150,230]:[0,70,130]);
   });
   await capture(label+'-free-style-overview.png');
   for(const tier of ['trailer','apartment','starter','family','mansion']){
   await page.evaluate(tier=>{
    const {THREE,root,lots,render}=window.__estatesGameplayQA;
    const lot=lots.find(l=>l.tier===tier);
    const target=new THREE.Vector3(root.position.x+lot.position.x,root.position.y+2.8,root.position.z);
    const range=innerWidth<600?27:22;
    render(target,[range*.75,range*.57,range]);
   },tier);
   await capture(label+'-'+tier+'.png');
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
  await capture(label+'-nonowned-upgrade-preview.png');
  await page.evaluate(()=>{
   const {THREE,root,privateRoom,decor,render}=window.__estatesGameplayQA;
   decor.clearUpgradePreview();root.visible=false;privateRoom.setRoom('bunker');
   // Eye-level third-person composition (not an overhead view into the ceiling).
   render(new THREE.Vector3(1875,9.8,-1111),[4,1,5.2]);
  });
  await capture(label+'-bunker-interior.png');
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
  console.log('Estates interior browser legibility',engine,label,JSON.stringify({readable:final.readableFraction,bright:final.brightFraction,parts:final.roomGeometry}));
  assert.equal(final.roomName,'bunker');
  assert(final.bunkerVisible&&final.roomGeometry>10);
  assert(final.readableFraction>.15,
   'private bunker may not render almost entirely black; real room surfaces must remain visible');
  assert(final.renderedDrawCalls>0,'3D private room must have visible geometry');
  // WebKit reports cross-origin console failures as page errors for the
  // pre-existing city XRPL/Aegis streams. Capture these separately; they are
  // not generated by the isolated Estates renderer and do not indicate a
  // bad WebGL frame. Any other runtime exception still fails this job.
  const baselineNetworkWarnings=pageErrors.filter(e=>
   /due to access control checks/i.test(e)&&
   /(?:api\.xrpl\.fun|s1\.ripple\.com)/i.test(e));
  const observerWarnings=pageErrors.filter(e=>
   e.trim()==='ResizeObserver loop completed with undelivered notifications.');
  // WebKit exposes ResizeObserver's benign undelivered-notification warning as
  // a pageerror while rapidly resizing the isolated canvas. Keep it in the
  // report, but reject every actual exception or unknown browser failure.
  const sceneErrors=pageErrors.filter(e=>!baselineNetworkWarnings.includes(e)&&!observerWarnings.includes(e));
  assert.deepEqual(sceneErrors,[],'no unhandled Estates or other JavaScript exceptions in browser');
  outcomes.push({label,...setup,...final,sceneErrors,baselineNetworkWarnings,observerWarnings});
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
