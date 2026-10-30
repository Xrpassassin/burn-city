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
 }
} finally {await browser.close();server.close();}
