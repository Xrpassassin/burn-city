// Isolated WebGL visual smoke test for the PR branch. No live payments,
// no property entitlement spoofing, and no production user state is changed.
// Visual fixtures are mounted only inside this disposable local browser.
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
  await page.waitForFunction(()=>window.__ready&&window.__city?.S&&window.__city?.R&&window.__estatesIslandLive?.manifest,{timeout:60000});
  const setup=await page.evaluate(async()=>{
   const THREE=await import('three');
   const {renderEstateHouses}=await import('./js/estates-house-design.mjs');
   const {createEstateTycoonDecor}=await import('./js/estates-tycoon-decor.mjs');
   const {ESTATE_EXTERIOR_ITEM_IDS}=await import('./js/estates-tycoon-architecture.mjs');
   const {createEstateHelicopterWorld}=await import('./js/estates-helicopter-world.mjs');
   const {createEstatesSecretInteriorRenderer}=await import('./js/estates-secret-interior-renderer.mjs');
   const city=window.__city,root=new THREE.Group();
   root.name='branch-visual-QA-only';
   // Separate from the normal shared-world/owner-entitlement scene.
   root.position.set(1850,8,-1200);city.S.add(root);
   const specs=[['trailer',6,5,3],['apartment',7,8,10],['starter',8,7,5],
    ['family',10,9,6],['mansion',13,11,8]];
   const lots=specs.map(([tier,w,d,h],i)=>({
    id:'qa-'+tier,propertyId:'qa-'+tier,tier,position:{x:(i-2)*26,y:.15,z:0},
    dimensions:{width:20,depth:18},buildingFootprint:{width:w,depth:d,height:h}
   }));
   const lights=new THREE.AmbientLight(0xffffff,1.7);root.add(lights);
   const sun=new THREE.DirectionalLight(0xffe7c0,2.3);sun.position.set(-20,45,35);root.add(sun);
   for(const lot of lots){
    const ground=new THREE.Mesh(new THREE.BoxGeometry(20,.15,18),new THREE.MeshStandardMaterial({color:0x506e49,roughness:1}));
    ground.position.set(lot.position.x,-.04,0);ground.name='qa-lot-ground-'+lot.tier;root.add(ground);
    const walkway=new THREE.Mesh(new THREE.BoxGeometry(2.6,.09,7.5),new THREE.MeshStandardMaterial({color:0x898679,roughness:1}));
    walkway.position.set(lot.position.x,.09,5.6);root.add(walkway);
   }
   renderEstateHouses(THREE,root,lots);
   const decor=createEstateTycoonDecor({THREE,parent:root,lots});
   decor.setUpgrades(lots.map(l=>({propertyId:l.propertyId,unlockedItemIds:ESTATE_EXTERIOR_ITEM_IDS})));
   const heli=createEstateHelicopterWorld({THREE,parent:root,lots});
   heli.setVerified([{propertyId:'qa-family',unlockedItemIds:['estate-helicopter']},
    {propertyId:'qa-mansion',unlockedItemIds:['estate-helicopter']}]);
   const privateRoom=createEstatesSecretInteriorRenderer({THREE,scene:city.S,origin:{x:1875,y:8,z:-1110}});
   const stats={ready:!!window.__ready,glVersion:city.R.getContext().getParameter(city.R.getContext().VERSION),
    lotCount:lots.length,upgrades:ESTATE_EXTERIOR_ITEM_IDS.length,
    helicopterLots:heli.properties,
    props:root.children.filter(c=>c.name==='estate-tycoon-verified-decorations')
      .flatMap(c=>c.children).reduce((n,g)=>n+g.children.length,0),
    rendererDrawCalls:city.R.info.render.calls};
   window.__estatesGameplayQA={THREE,city,root,lots,decor,heli,privateRoom};
   return stats;
  });
  assert.equal(setup.lotCount,5);
  assert.equal(setup.upgrades,17);
  assert.equal(setup.helicopterLots.length,2);
  assert(setup.props>30,'five distinct estates should show meaningful purchased upgrades');
  for(const tier of ['trailer','apartment','starter','family','mansion']){
   await page.evaluate(tier=>{
    const {city,THREE,root,lots}=window.__estatesGameplayQA;
    const lot=lots.find(l=>l.tier===tier);
    const target=new THREE.Vector3(root.position.x+lot.position.x,root.position.y+2.8,root.position.z+lot.position.z);
    const range=window.innerWidth<600?27:22;
    city.orbit.target.copy(target);city.C.position.copy(target).add(new THREE.Vector3(range*.75,range*.57,range));
    city.C.lookAt(target);city.orbit.update();
   },tier);
   await page.waitForTimeout(450);
   await page.screenshot({path:out+'/'+label+'-'+tier+'.png'});
  }
  await page.evaluate(()=>{
   const {city,THREE,root,privateRoom}=window.__estatesGameplayQA;
   root.visible=false;privateRoom.setRoom('bunker');
   const target=new THREE.Vector3(1875,9.8,-1110);
   city.orbit.target.copy(target);city.C.position.copy(target).add(new THREE.Vector3(5,2.5,5.8));
   city.C.lookAt(target);city.orbit.update();
  });
  await page.waitForTimeout(450);
  await page.screenshot({path:out+'/'+label+'-bunker-interior.png'});
  const final=await page.evaluate(()=>{
   const qa=window.__estatesGameplayQA;
   return {bunkerVisible:qa.privateRoom.root.visible,roomName:qa.privateRoom.layout?.roomId,
    roomGeometry:qa.privateRoom.root.children.length,
    fpsRendererCalls:qa.city.R.info.render.calls};
  });
  assert.equal(final.roomName,'bunker');
  assert(final.bunkerVisible&&final.roomGeometry>10);
  assert(!pageErrors.some(x=>/estates-tycoon|estate-helicopter|estates-secret|WebGL/i.test(x)),
   'no Estates or WebGL exception in isolated preview');
  outcomes.push({label,...setup,...final,pageErrors});
  await page.evaluate(()=>{
   const qa=window.__estatesGameplayQA;qa.decor.dispose();qa.heli.dispose();
   qa.privateRoom.dispose();qa.city.S.remove(qa.root);
  });
  await context.close();
 }
 writeFileSync(out+'/report.json',JSON.stringify(outcomes,null,2));
 console.log('Estates five-tier WebGL visual smoke passed',JSON.stringify(outcomes));
}finally{await browser.close();}
