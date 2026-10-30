// Browser integration of the real island host and Three.js scene objects.
// Admission/appearance are fixtures; no wallet or mainnet operations are performed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('client');
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="background:#172330"><div id="touch"><div id="joy"><div id="knob"></div></div><div id="tbtns"><button id="tJump">Jump</button><button id="tRun">Run</button><button id="tUse" aria-label="Use">E</button></div></div><script type="module">
import * as THREE from '/vendor/three/build/three.module.min.js';
import {installEstatesIslandLive} from '/js/estates-island-live.mjs';
import {buildEstatesIslandScene} from '/js/estates-island-scene.mjs';
const catalog=await (await fetch('/data/estate-catalog.json')).json();
const manifest=buildEstatesIslandScene({catalog});
const scene=new THREE.Scene(),player={pos:new THREE.Vector3(445,.1,188),vel:new THREE.Vector3()},avatar=new THREE.Group(),camera=new THREE.PerspectiveCamera();
scene.add(avatar,camera);let yaw=0,mode='explore',pressed=false;
window.fixture={manifest,player,scene};
window.host=await installEstatesIslandLive({THREE,scene,player,avatar,camera,getYaw:()=>yaw,setYaw:v=>yaw=v,getMode:()=>mode,setMode:v=>mode=v,buildWalker:()=>new THREE.Group(),poseWalker:()=>{},isInteractPressed:()=>pressed});
document.querySelector('#tUse').addEventListener('touchstart',e=>{pressed=true;e.preventDefault();},{passive:false});
document.querySelector('#tUse').addEventListener('touchend',()=>{host.tick(.016,0,0,false);pressed=false;host.tick(.016,0,0,false);});
if(innerWidth<700)document.querySelector('#touch').classList.add('on');
window.step=()=>host.tick(.016,0,0,false);
window.ready=true;
</script>`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')) {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.pathname.includes('/instance/')?{ok:true,leaseToken:'browser-fixture',instanceId:'test'}:{properties:[]}));return;}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:667,height:375}]) {
  const mobile=viewport.width<700,page=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>host.enterFromCity());await page.getByRole('button',{name:'Browse Estates'}).waitFor();
  await page.getByRole('button',{name:'Browse Estates'}).click();
  await page.getByLabel('Search Estates').waitFor({state:'visible'});
  const selected=await page.evaluate(()=>fixture.manifest.lots.find(l=>l.propertyId));
  await page.getByLabel('Search Estates').fill(selected.address);
  const result=page.getByRole('button',{name:selected.address+' · '+selected.district+' · '+selected.tier,exact:true});
  await result.waitFor();
  const clear=async()=>assert.equal(await page.evaluate(()=>{
   const panel=document.querySelector('#bcEstatesLivePrompt').getBoundingClientRect();
   const blockers=['#joy','#tbtns','#bcEstatesExit','#bcEstatesDirectoryButton','#bcEstatesWalkingGuidance'];
   return panel.width>0&&panel.height>=120&&panel.x>=0&&panel.right<=innerWidth&&panel.y>=0&&panel.bottom<=innerHeight&&blockers.every(s=>{
    const b=document.querySelector(s).getBoundingClientRect();return !b.width||!b.height||!(panel.x<b.right&&panel.right>b.x&&panel.y<b.bottom&&panel.bottom>b.y);
   });
  }),true,'panel is visible and clears controls at '+JSON.stringify(viewport));
  await clear();await result.click();await page.evaluate(()=>step());
  await page.getByRole('status').filter({hasText:selected.address}).waitFor();
  assert.equal(await page.evaluate(()=>fixture.scene.getObjectByName('estates-selected-property-beacon').visible),true);
  // Move to a navigable approach using the real navigation manifest. This tests
  // proximity/inspection, not the city app's joystick event-to-frame wiring.
  await page.evaluate(l=>{fixture.player.pos.set(650+l.position.x,.1,l.position.z+l.buildingFootprint.depth/2+2);step();},selected);
  await page.getByRole('button',{name:'View home & upgrades',exact:true}).waitFor();
  if(mobile){await page.getByRole('button',{name:'Use',exact:true}).tap();}
  else await page.getByRole('button',{name:'View home & upgrades',exact:true}).click();
  await page.getByRole('button',{name:'Navigate to property',exact:true}).waitFor();await clear();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Browse Estates'}).click();
  await page.getByLabel('Search Estates').fill('no-such-estate');await page.getByText('No matching lots.',{exact:true}).waitFor();
  await page.getByLabel('Search Estates').fill('');await page.getByLabel('Filter properties').selectOption('unassigned');
  await page.getByRole('button',{name:'Close directory'}).click();
  await page.getByRole('button',{name:'Return to BURN City',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Browse Estates'}).isVisible(),false);
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>host.dispose());await page.close();
  console.log('Directory, guidance, nearby inspection and unobscured controls passed',viewport);
  // The buyer-preview deep link is an explicit travel action. It must acquire
  // public-island admission, arrive outside the selected home, and reset motion.
  for(const scenario of ['direct','admission-retry','unknown']){
   const linked=await browser.newPage({viewport,isMobile:mobile,hasTouch:mobile});
   const errors=[],requests=[];linked.on('pageerror',e=>errors.push(e.message));linked.on('request',r=>requests.push({url:r.url(),method:r.method()}));
   let attempts=0;
   if(scenario==='admission-retry')await linked.route('**/api/estates/instance/enter',route=>++attempts===1?route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'admission_denied'})}):route.continue());
   const id=scenario==='unknown'?'not-a-real-property':selected.propertyId;
   await linked.goto('http://127.0.0.1:'+server.address().port+'/?estateProperty='+encodeURIComponent(id)+'&x=999999&z=-999999');
   await linked.waitForFunction(()=>window.ready);
   if(scenario==='unknown'){
    assert.equal(await linked.evaluate(()=>host.active),false);
    assert.equal(requests.some(r=>r.url.includes('/instance/enter')),false);
   }else{
    if(scenario==='admission-retry'){
     assert.equal(await linked.evaluate(()=>host.active),false);
     assert.deepEqual(await linked.evaluate(()=>({x:fixture.player.pos.x,z:fixture.player.pos.z})),{x:445,z:188});
     await linked.getByRole('button',{name:'Retry entry',exact:true}).click();await linked.waitForFunction(()=>host.active);
    }
    const check=await linked.evaluate(async propertyId=>{
     const {createEstatesIslandNavigation}=await import('/js/estates-island-navigation.mjs');
     const nav=createEstatesIslandNavigation({manifest:host.manifest}),lot=host.manifest.lots.find(l=>l.propertyId===propertyId),arrival=nav.propertyApproach(propertyId),p=fixture.player.pos;
     return {active:host.active,walkable:nav.isWalkable({x:p.x-650,y:p.y,z:p.z}),position:{x:p.x-650,y:p.y,z:p.z},expected:{...arrival,y:.1},outside:Math.abs(p.x-650-lot.position.x)>=lot.buildingFootprint.width/2||Math.abs(p.z-lot.position.z)>=lot.buildingFootprint.depth/2,velocity:fixture.player.vel.length(),presencePaused:window.__estatesCityPresencePaused};
    },selected.propertyId);
    assert.equal(check.active,true);assert.equal(check.walkable,true);assert.equal(check.outside,true);assert.equal(check.velocity,0);assert.equal(check.presencePaused,true);assert.deepEqual(check.position,check.expected);
    await linked.getByRole('button',{name:'View home & upgrades',exact:true}).waitFor();
    // Another valid target works without a second admission; unknown IDs cannot move anyone.
    const arrivalCount=requests.filter(r=>r.url.includes('/instance/enter')).length;
    const last=await linked.evaluate(()=>host.manifest.lots.filter(l=>l.propertyId).at(-1).propertyId);
    await linked.evaluate(()=>fixture.player.vel.set(7,2,5));
    assert.equal(await linked.evaluate(id=>host.teleportToProperty(id),last),true);
    assert.equal(await linked.evaluate(()=>fixture.player.vel.length()),0);
    assert.equal(requests.filter(r=>r.url.includes('/instance/enter')).length,arrivalCount);
    const before=await linked.evaluate(()=>fixture.player.pos.toArray());
    assert.equal(await linked.evaluate(()=>host.teleportToProperty('not-real')),false);
    assert.deepEqual(await linked.evaluate(()=>fixture.player.pos.toArray()),before);
    await linked.getByRole('button',{name:'Return to BURN City',exact:true}).click();
    assert.deepEqual(await linked.evaluate(()=>fixture.player.pos.toArray()),[445,.1,188]);
    assert.equal(await linked.evaluate(()=>window.__estatesCityPresencePaused),false);
    await linked.getByRole('button',{name:'Teleport to property',exact:true}).click();await linked.waitForFunction(()=>host.active);
    await linked.evaluate(()=>step());
    assert.equal(await linked.evaluate(()=>host.active),true,'return and re-entry recreate a usable controller');
   }
   assert.equal(requests.some(r=>r.method==='POST'&&!r.url.includes('/instance/')),false,'travel does not create purchases or change access rights');
   assert.deepEqual(errors,[]);await linked.evaluate(()=>host.dispose());await linked.close();
  }
  console.log('Property teleport, admission retry, unknown IDs and city return passed',viewport);

 }
} finally {await browser.close();server.close();}
