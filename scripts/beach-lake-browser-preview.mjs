import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,
 ...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),
 args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--no-zygote']});
const out=process.env.BEACH_PREVIEW_OUTPUT||'beach-preview-output';mkdirSync(out,{recursive:true});
try{
 for(const [name,width,height,q] of [['desktop',1365,768,'medium'],['mobile',390,844,'low']]){
  const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile',serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const resp=await page.goto('http://localhost:8080/?noguide=1&live=0&q='+q+'&view=street',{waitUntil:'domcontentloaded',timeout:60000});
  assert.equal(resp?.status(),200);
  await page.waitForFunction(()=>window.__ready&&window.__estate?.beach&&window.__cityLife?.ready&&window.__streetProps,{timeout:60000});
  const checks=await page.evaluate(()=>{
   const e=window.__estate,c=window.__city,b=e.beach;
   const point=(x,z)=>({x:b.origin.x-e.side.x*x+e.dir.x*z,z:b.origin.z-e.side.z*x+e.dir.z*z});
   const parking=[];for(const x of [-21,0,21])for(const z of [-10.5,0,10.5])parking.push(point(x,z));
   const path=[point(0,2),point(0,14),point(0,26)];
   const dry=p=>!e.inLake(p.x,p.z)&&!e.inCityIsland(p.x,p.z);
   let boundary=true;
   for(let i=0;i<64;i++){
    const a=i/64*Math.PI*2,r=e.rho(a);
    const p=f=>({x:e.lakeC.x+e.side.x*Math.cos(a)*e.Wd*r*f+e.dir.x*Math.sin(a)*e.D*r*f,z:e.lakeC.z+e.side.z*Math.cos(a)*e.Wd*r*f+e.dir.z*Math.sin(a)*e.D*r*f});
    const inside=p(.98),outside=p(1.02);
    if(!e.inLake(inside.x,inside.z)||e.inLake(outside.x,outside.z))boundary=false;
   }
   const bridges=(window.__decks||[]).filter(d=>d.base?.distanceTo(e.bridgeStart)<.01);
   const park=c.S.getObjectByName('city-beach-parking');
   const obstacles=c.colliders.filter(o=>o.r>0&&b.contains(o.x,o.z,o.r+.5)).map(o=>({x:o.x,z:o.z,r:o.r,h:o.h}));
   return {placement:b.placementFound,origin:b.origin, junction:b.junction, dir:e.dir, side:e.side, ready:!!window.__ready,parkingDry:parking.every(dry),pathDry:path.every(dry),routeDry:b.route.every(dry),boundary,bridgeDeck:bridges.length===1,
    shaderDimensions:window.__water.fragmentShader.includes('/'+e.Wd.toFixed(1))&&window.__water.fragmentShader.includes('/'+e.D.toFixed(1)),parkingMeshes:park?.children.filter(o=>o.isMesh).length,render:c.R.info.render,obstacles};
  });
  console.log(name,JSON.stringify(checks));
  assert(checks.placement,'find a clear beach placement');
  assert(checks.parkingDry&&checks.pathDry&&checks.routeDry,'parking, walking path and access road must stay out of water');
  assert(checks.shaderDimensions,'water shader uses the navigation lake dimensions');
  assert(checks.boundary&&checks.bridgeDeck,'shoreline and gateway deck must match navigation');
  assert.equal(checks.obstacles.length,0,'parking, walking path and access road must avoid solid city props');
  assert(checks.parkingMeshes<=7,'stationary parking geometry stays batched by material');
  for(const view of ['parking','shore','gateway']){
   await page.evaluate(view=>{
    for(const id of ['recap','iosHint'])document.getElementById(id)?.remove();
    const e=window.__estate,c=window.__city;
    const target=view==='parking'?e.beach.origin.clone():view==='shore'?e.lakeC.clone():e.islandEntrance.clone();
    c.orbit.target.copy(target);
    const range=view==='shore'?280:view==='gateway'?85:65;
    c.C.position.copy(target).addScaledVector(e.dir,-range).addScaledVector(e.side,range*.7);c.C.position.y=range;
    c.C.lookAt(target);c.orbit.update();
   },view);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:out+'/'+name+'-'+view+'.png'});
  }
  assert.deepEqual(errors,[],'no uncaught browser errors');
  await context.close();
 }
}finally{await browser.close()}
