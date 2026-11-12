// Read-only real WebGL acceptance for the ORIGINAL Zombies map rendering.
// Never joins a paid match, edits game state, calls Homefront or starts combat.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const playwrightRequire=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/package.json');
const {chromium,webkit}=playwrightRequire('playwright');
const {Room}=require('../server/game');
const Cod=require('../server/cod');
const browserName=process.env.ZOMBIE_QA_BROWSER||'chromium';
const engine=browserName==='webkit'?webkit:chromium;
const out=process.env.ZOMBIE_QA_OUTPUT||'zombies-map-quality-previews';
await mkdir(out,{recursive:true});
function makeLayout(name){
 const id=name==='refinery'?'refinery':null;
 const room=new Room('map-art-'+name,'zombie',id);
 if(name==='cosmodrome')room.mapId='cosmodrome';
 if(name==='procedural')room.seedT=9827;
 room.reset();Cod.bind(room);
 const map=Cod.layout();
 assert.equal(map.kind,name==='procedural'?'proc':name==='refinery'?'classic':'cosmodrome');
 return JSON.parse(JSON.stringify(map));
}
const layouts=Object.fromEntries(['refinery','cosmodrome','procedural'].map(name=>[name,makeLayout(name)]));
const browser=await engine.launch({
 headless:true,args:browserName==='webkit'?[]:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']
});
const output=[];
try{
 for(const view of [{name:'desktop',width:1280,height:760,mobile:false},
                     {name:'phone',width:390,height:844,mobile:true}]){
  const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},
    deviceScaleFactor:1,isMobile:view.mobile,hasTouch:view.mobile});
  const page=await ctx.newPage(),errors=[];
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/i.test(m.text()))errors.push(m.text())});
  await page.goto('http://127.0.0.1:8080/arena/index.html?zombieModels=0',
   {waitUntil:'domcontentloaded',timeout:45000});
  for(const [name,layout] of Object.entries(layouts)){
   const report=await page.evaluate(async ({name,layout,mobile})=>{
    const THREE=await import('./vendor/three.module.min.js');
    const {createCodWorld}=await import('./cod.js');
    const {planZombiesRoomDressing}=await import('./zombies-room-dressing-plan.mjs');
    const {planZombiesBioContainment}=await import('./zombies-bio-containment-plan.mjs');
    window.__zombieRoomPreview?.world?.dispose();
    window.__zombieRoomPreview?.renderer?.dispose();
    window.__zombieRoomPreview?.renderer?.domElement?.remove();
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x1b2228);
    scene.fog=new THREE.Fog(0x0a0504,14,95);
    scene.add(new THREE.HemisphereLight(0xffe6c7,0x11121a,1.35));
    const sun=new THREE.DirectionalLight(0xe8ccb2,1.0);sun.position.set(-10,18,7);scene.add(sun);
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
    renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight,false);
    renderer.domElement.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;display:block;touch-action:none';
    document.body.appendChild(renderer.domElement);
    const camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.1,250);
    const world=createCodWorld(scene,layout,{low:mobile});
    world.applyEnv();
    // Visual QA uses a finished/unlocked match so dark-zone floor tint does
    // not conceal the art. Does not change any live map or networking state.
    world.update(.016,[(1<<Math.min(24,layout.zones.length))-1,0,0,1]);
    const sites=planZombiesRoomDressing(layout,{low:mobile});
    const containmentSites=planZombiesBioContainment(layout,{low:mobile});
    const preferred=containmentSites[0]||
      sites.find(s=>['lab','chapel','furnace','generator','control'].includes(s.theme))||sites[0];
    if(!preferred)throw Error('No actual authored room scenery for map '+name);
    // Face the selected wall fixture from a nearby eye-height camera.
    const nx=Math.sin(preferred.yaw),nz=Math.cos(preferred.yaw);
    const tx=nz,tz=-nx;
    camera.position.set(preferred.x+nx*5.8+tx*1.25,2.0,preferred.z+nz*5.8+tz*1.25);
    camera.lookAt(preferred.x,2.12,preferred.z);
    renderer.render(scene,camera);
    const info=world.zombieRoomDressing();
    const ruins=world.zombieRuins();
    const containment=world.zombieBioContainment();
    const biological=scene.getObjectByName('zombies-bio-containment-lobe');
    if(!containment.sites||containment.sites>8||containment.drawCalls>6||!biological?.isInstancedMesh||!biological.material.map)
      throw Error('Bio containment cannot render animated PBR flesh in existing Zombies map');
    const slab=scene.getObjectByName('zombies-ruins-slab');
    const glass=scene.getObjectByName('zombies-ruins-glass');
    if(!slab||!slab.isInstancedMesh||!slab.material.map)
      throw Error('Missing locally loaded CC0 scanned concrete on actual Zombies broken ceilings');
    if(!ruins.clusters||ruins.drawCalls>6)
      throw Error('Broken architecture failed WebGL scene instancing budget');
    if(ruins.windows&&(!glass||!glass.material.transparent))
      throw Error('Shattered glass must match actual boardable zombie windows');
    window.__zombieRoomPreview={renderer,scene,world,camera,preferred};
    return {name,map:layout.name,kind:layout.kind,theme:preferred.theme,
     drawCalls:renderer.info.render.calls,sites:info.sites,instances:info.instances,
     batches:info.drawCalls,ruins,containment,
     cc0ScanUrl:slab.material.map.image?.src||null,
     rendererBytes:renderer.domElement.width*renderer.domElement.height*4};
   },{name,layout,mobile:view.mobile});
   assert(report.sites>0&&report.batches<=5);
   assert(report.ruins.clusters>=1&&report.ruins.drawCalls<=6,
    'genuine ruin geometry is present in screenshot for '+name+'/'+view.name);
   assert(report.containment.sites>=1&&report.containment.drawCalls<=6,
    'real bio containment scene is present on '+name+'/'+view.name);
   assert(report.drawCalls>0&&report.drawCalls<306,
     'decorative scene should remain bounded for '+name+'/'+view.name);
   assert(report.instances>=report.sites*4,'rooms must have recognizable detail, not one flat panel');
   assert.equal(errors.length,0,errors.join(';'));
   await page.screenshot({path:out+'/'+browserName+'-'+view.name+'-'+name+'.png',fullPage:false});
   if(!view.mobile){
    await page.evaluate(async ()=>{
     const {scene,renderer,camera,preferred}=window.__zombieRoomPreview;
     const {createZombieOriginalFallback}=await import('./zombies-original-body-horror.mjs');
     const blob=createZombieOriginalFallback(5);
     if(!blob||!blob.hidesBaseModel||createZombieOriginalFallback(8)!==null)
       throw Error('Only the original smooth organic crawler fallback is permitted; no fake nurse');
     const nx=Math.sin(preferred.yaw),nz=Math.cos(preferred.yaw);
     blob.group.position.set(preferred.x+nx*2.2,0,preferred.z+nz*2.2);
     blob.update(.12);
     scene.add(blob.group);
     camera.position.set(preferred.x+nx*5.1,1.35,preferred.z+nz*5.1);
     camera.lookAt(preferred.x+nx*2.1,.46,preferred.z+nz*2.1);
     renderer.render(scene,camera);
     window.__zombieRoomPreview.specials=[blob];
    });
    await page.screenshot({path:out+'/'+browserName+'-'+view.name+'-'+name+'-original-blob-concept.png',fullPage:false});
    await page.evaluate(()=>{
     const v=window.__zombieRoomPreview;
     for(const a of v.specials||[]){v.scene.remove(a.group);a.dispose();}
     v.specials=[];
     v.renderer.render(v.scene,v.camera);
    });
    await page.evaluate(()=>{
     const {camera,renderer,scene}=window.__zombieRoomPreview;
     const C=scene.children.find(x=>x.name==='zombies-room-dressing-box');
     const site=C?.boundingSphere?.center||{x:0,z:0};
     camera.position.set(site.x+11,13,site.z+12);
     camera.lookAt(site.x,0,site.z);
     renderer.render(scene,camera);
    });
    await page.screenshot({path:out+'/'+browserName+'-'+view.name+'-'+name+'-overview.png',fullPage:false});
   }
   output.push({...report,view:view.name,browser:browserName});
  }
  await ctx.close();
 }
}finally{await browser.close();}
console.log('ZOMBIES_MAP_VISUAL_QA '+JSON.stringify(output));
