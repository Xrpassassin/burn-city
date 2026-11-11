// Isolated DRY_RUN buyer-directory and real WebGL render test. No XRP signing.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const requirePlaywright=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/package.json');
const {chromium,webkit}=requirePlaywright('playwright');
const engine=process.env.ESTATES_INVENTORY_BROWSER==='webkit'?webkit:chromium;
const tag=process.env.ESTATES_INVENTORY_BROWSER||'chromium';
const out=process.env.ESTATES_INVENTORY_OUTPUT||'estates-inventory-output';
await mkdir(out,{recursive:true});
const browser=await engine.launch({headless:true,args:tag==='webkit'?[]:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const errors=[],results=[];
try{
 for(const v of [{name:'desktop',width:1365,height:850,mobile:false},
                 {name:'mobile',width:390,height:844,mobile:true}]){
  const ctx=await browser.newContext({viewport:{width:v.width,height:v.height},isMobile:v.mobile,hasTouch:v.mobile,deviceScaleFactor:1});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(v.name+': '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error|VALIDATE_STATUS/i.test(m.text()))errors.push(v.name+': '+m.text())});
  await page.route('**/api/estates/ownership',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   asOfMs:Date.now(),properties:[
    {propertyId:'trailer-01',owner:'rSOLD0001'},
    {propertyId:'trailer-02',owner:'rSOLD0002'},
    {propertyId:'starter-04',owner:'rSOLD0003'}
   ]})}));
  await page.goto('http://127.0.0.1:8080/estate-properties.html',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.querySelectorAll('#properties article').length===33,null,{timeout:30000});
  const pick=async(tier,unowned,count)=>{
   await page.locator('#estate-tier-filter').selectOption(tier);
   const cb=page.locator('#estate-unowned-filter');
   if(await cb.isChecked()!==unowned)await cb.click();
   await page.waitForFunction(expected=>document.querySelectorAll('#properties article').length===expected,count,{timeout:10000});
   const visible=await page.locator('#properties article').count();
   assert.equal(visible,count,'filter '+tier+'/'+unowned);
  };
  await pick('trailer',true,8);
  await page.screenshot({path:out+'/'+tag+'-'+v.name+'-eight-unsold-trailers.png',fullPage:false});
  await pick('starter',true,9);
  await pick('family',true,6);
  await pick('all',false,33);
  const directory=await page.evaluate(()=>({
   total:document.querySelectorAll('#properties article').length,
   summary:document.getElementById('estate-catalog-count')?.textContent,
   touchTarget:getComputedStyle(document.getElementById('estate-tier-filter')).minHeight,
   selectedTier:document.getElementById('estate-tier-filter').value
  }));
  assert(directory.summary.includes('30 unowned'),'directory ownership is live, not hardcoded');
  assert(parseFloat(directory.touchTarget)>=44,'tier selector has a mobile-friendly touch target');
  const rendered=await page.evaluate(async()=>{
   const THREE=await import('./vendor/three/build/three.module.min.js');
   const {buildEstatesIslandScene}=await import('./js/estates-island-scene.mjs');
   const {createEstatesIslandRenderer}=await import('./js/estates-island-renderer.mjs');
   const cat=await (await fetch('./data/estate-catalog.json',{cache:'no-store'})).json();
   const manifest=buildEstatesIslandScene({catalog:cat}),scene=new THREE.Scene();
   scene.background=new THREE.Color(0x7999aa);
   scene.add(new THREE.HemisphereLight(0xf0f4ef,0x62705b,1.35));
   const sun=new THREE.DirectionalLight(0xffe6c4,1.65);
   sun.position.set(-90,170,80);scene.add(sun);
   const view=createEstatesIslandRenderer({THREE,scene,manifest});
   const gl=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power'});
   gl.setPixelRatio(1);gl.setSize(Math.round(innerWidth),Math.round(innerHeight),false);
   gl.domElement.setAttribute('aria-label','33 property Estates Island visual QA');
   gl.domElement.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;pointer-events:none;display:block;background:#7999aa';
   document.body.append(gl.domElement);
   const cam=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,850);
   cam.position.set(135,180,220);cam.lookAt(0,0,0);
   gl.render(scene,cam);
   const details={lots:manifest.lots.filter(l=>l.propertyId).length,
    houses:manifest.lots.filter(l=>l.buildingFootprint).length,
    mailboxes:manifest.streetFurniture.filter(x=>x.kind==='mailbox').length,
    lamps:manifest.streetFurniture.filter(x=>x.kind==='street-light').length,
    fixtureCount:view.neighborhood.fixtureCount,
    batches:view.neighborhood.drawBatches,
    drawCalls:gl.info.render.calls,
    screenshotWidth:gl.domElement.width,screenshotHeight:gl.domElement.height,
    trailer10Visible:!!view.getObject(manifest.lots.find(x=>x.propertyId==='trailer-10').id),
    family06Visible:!!view.getObject(manifest.lots.find(x=>x.propertyId==='family-06').id)};
   window.__estateInventoryQARender={gl,view};
   return details;
  });
  assert.equal(rendered.lots,33);assert.equal(rendered.houses,33);
  assert.equal(rendered.mailboxes,33);assert.equal(rendered.lamps,16);
  assert(rendered.trailer10Visible&&rendered.family06Visible);
  assert(rendered.drawCalls>0,'actual WebGL scene drawn');
  assert(rendered.drawCalls<250,'larger catalog must remain reasonably batched on desktop and mobile');
  await page.screenshot({path:out+'/'+tag+'-'+v.name+'-33-lot-island.png',fullPage:false});
  results.push({viewport:v.name,directory,rendered});
  await ctx.close();
 }
 assert.deepEqual(errors,[],'all mobile and desktop runs have no page or shader errors');
 await writeFile(out+'/'+tag+'-report.json',JSON.stringify({browser:tag,results,errors},null,2));
 console.log(JSON.stringify({browser:tag,results,errors},null,2));
}finally{await browser.close();}
