// Real original Arena Zombies WebGL + helicopter sound and mount interaction.
// Uses only synthetic server snapshots. No player accounts or XRP transactions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const requirePlaywright=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/package.json');
const {chromium,webkit}=requirePlaywright('playwright');
const engine=process.env.HELI_QA_BROWSER==='webkit'?webkit:chromium;
const tag=process.env.HELI_QA_BROWSER||'chromium',out=process.env.HELI_QA_OUTPUT||'zombie-helicopter-qa-output';
await mkdir(out,{recursive:true});
const browser=await engine.launch({headless:true,args:tag==='webkit'?[]:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const errors=[],results=[];
try {
 for(const view of [{name:'desktop',width:1365,height:850,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]) {
  const context=await browser.newContext({viewport:{width:view.width,height:view.height},isMobile:view.mobile,hasTouch:view.mobile,deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(view.name+' '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error|VALIDATE_STATUS/.test(m.text()))errors.push(view.name+' '+m.text());});
  await page.addInitScript(()=>{
   window.__qaAudio=[];
   const Base=window.AudioContext||window.webkitAudioContext;
   if(Base){
    window.AudioContext=class extends Base{
     constructor(...args){super(...args);window.__qaAudio.push(this);this.closedByQA=false;}
     close(){this.closedByQA=true;return super.close();}
    };
   }
  });
  await page.goto('http://127.0.0.1:8080/arena/index.html',{waitUntil:'domcontentloaded',timeout:45000});
  // Native browser DOM and renderer, synthetic helicopter snapshot: boarded ID 7.
  const initial=await page.evaluate(async()=>{
   const THREE=await import('three');
   const {createHeli}=await import('./heli.js');
   const scene=new THREE.Scene();scene.background=new THREE.Color(0x161a1e);
   const light=new THREE.HemisphereLight(0xbdd4ed,0x35322d,1.2);scene.add(light);
   const camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,.1,400);
   camera.position.set(8,7,18);camera.lookAt(0,3,0);
   const renderer=new THREE.WebGLRenderer({antialias:false});
   renderer.setSize(innerWidth,innerHeight,false);
   renderer.domElement.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:1;pointer-events:none';
   document.body.appendChild(renderer.domElement);
   const heli=createHeli(scene,{low:false,audioSettings:()=>({volume:.3,muted:false})});
   const snapshot=[2,60,[7],0,1,[0,0],[0,0],0,0,3.6,0];
   heli.update(.016,1,snapshot,{me:7,cam:camera,quest:null,hasPad:true,players:[],yaw:0,pitch:0});
   renderer.render(scene,camera);
   window.__heliQA={heli,snapshot,scene,renderer,camera,rotorAudio:window.__qaAudio.at(-1)};
   return {
    canvases:document.querySelectorAll('canvas').length,
    gunVisible:!document.getElementById('heliGunUse').hidden,
    gunText:document.getElementById('heliGunUse').textContent,
    gunButtonMinHeight:getComputedStyle(document.getElementById('heliGunUse')).minHeight,
    contexts:window.__qaAudio.length,drawCalls:renderer.info.render.calls
   };
  });
  assert(initial.gunVisible,'the boarded player must have a visible minigun action');
  assert(initial.gunText.includes('MAN MINIGUN'));
  assert(parseFloat(initial.gunButtonMinHeight)>=48,'touch target is large enough for phones');
  assert(initial.drawCalls>0,'actual helicopter WebGL geometry renders');
  await page.screenshot({path:out+'/'+tag+'-'+view.name+'-mount-minigun.png',fullPage:false});
  await page.locator('#heliGunUse').click();
  let used=await page.evaluate(()=>window.__heliQA.heli.takeUse());
  assert.equal(used,true,'tap or mouse click sends a single USE request');
  used=await page.evaluate(()=>window.__heliQA.heli.takeUse());
  assert.equal(used,false,'same click must not generate multiple input packets');
  const mounting=await page.evaluate(()=>{
   const {heli,snapshot,renderer,scene,camera}=window.__heliQA;
   snapshot[5][0]=7;heli.update(.016,2,snapshot,{me:7,cam:camera,quest:null,hasPad:true,players:[],yaw:0,pitch:0});
   renderer.render(scene,camera);
   return {label:document.getElementById('heliGunUse').textContent,context:window.__qaAudio.at(-1)};
  });
  assert(mounting.label.includes('EXIT MINIGUN'),'UI responds to server-confirmed gun mount');
  await page.screenshot({path:out+'/'+tag+'-'+view.name+'-gunner-mounted.png',fullPage:false});
  const migration=await page.evaluate(async()=>{
   const {heli,scene,renderer,camera}=window.__heliQA;
   const audio=window.__heliQA.rotorAudio; // sfx creates its own master context on button tap
   heli.event({e:'map_transition',to:'The Ashen Cosmodrome'},7);
   heli.update(.016,3,null,{me:7,cam:camera,quest:null,hasPad:false,players:[]});
   const hudGone=document.getElementById('heliGunUse').hidden;
   heli.dispose();
   await new Promise(resolve=>setTimeout(resolve,30));
   return {hudGone,closed:!!audio?.closedByQA,ended:audio?.state,
     noButton:document.getElementById('heliGunUse')===null,sceneChildren:scene.children.length,
     totalAudioContexts:window.__qaAudio.length};
  });
  assert(migration.hudGone,'Map 2 transition hides mounted gun HUD');
  assert(migration.closed,'rotor, minigun and oscillators must be closed after transition');
  assert.equal(migration.ended,'closed','no helicopter audio bleeds into Cosmodrome');
  assert(migration.noButton,'teardown removes cross-platform interaction button');
  results.push({viewport:view.name,initial,gunnerLabel:mounting.label,migration});
  await context.close();
 }
 assert.equal(errors.length,0,'no JS or WebGL errors');
 console.log(JSON.stringify({results,errors},null,2));
 await writeFile(out+'/'+tag+'-report.json',JSON.stringify({results,errors},null,2));
} finally {await browser.close();}
