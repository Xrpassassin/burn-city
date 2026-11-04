// Real Three.js + immersive HUD browser smoke on a disposable localhost world.
// Unlike the layout fixture this loads the actual Graveyard WebGL renderer,
// world snapshot handler, camera controls, and production HUD implementation.
// No live accounts, Fly.io deploy, Xaman, spending, or persistent database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const localRequire = createRequire(import.meta.url);
const playwrightRequire = createRequire((process.env.PLAYWRIGHT_DIR || process.cwd()) + '/package.json');
const { chromium } = playwrightRequire('playwright');
const World = localRequire('../server/homefront-world.js');
const Homefront = localRequire('../server/homefront.js');
const ACCOUNT = 'ui-three-test-only';
const TOKEN = 'ui-three-token';
const objects = new Map();
const store = {
  load(key, fallback) { return objects.has(key) ? structuredClone(objects.get(key)) : fallback; },
  save(key, value) { objects.set(key, structuredClone(value)); }
};
const initialWorld = World.enter(World.defaultWorld(), ACCOUNT, Date.now() - 9000).world;
store.save('homefront-world.json', initialWorld);
const original = await readFile('client/arena/homefront.html', 'utf8');
const markup = original.slice(0, original.indexOf('<script type="module">'));
assert(markup.includes('id="graveyard3d"') && markup.includes('id="game" hidden'),
  'fixture keeps the original Homefront 3D + UI HTML');

const init = String.raw`
import { createHud } from './homefront-hud.mjs';
const game = document.getElementById('game');
game.hidden = false;
document.body.classList.add('rpg-mode-expedition');
const character = {level:1,xpThisLevel:0,xpNextLevel:100,attributePoints:0,
  skillPoints:0,perkPoints:0,attributes:[],skills:[],perks:[],
  equipment:{weapon:'pipe_blade'},slots:[],items:[],quests:[],log:[]};
window.__ui = {mode:'expedition',inWorld:{self:{x:0,z:0},players:[],
  selfSurvival:{health:100}}, denied:[],travelOpens:0,requests:[]};
const setMode = mode => {
  window.__ui.mode = mode;
  document.body.classList.remove('rpg-mode-home','rpg-mode-workshop','rpg-mode-expedition','rpg-mode-management');
  document.body.classList.add('rpg-mode-'+mode);
};
window.__ui.hud = createHud({
  request:async(path,method='GET',payload)=>{
    window.__ui.requests.push({path,method,payload});
    if(method!=='GET') throw new Error('test cannot mutate game state');
    return {sheet:character};
  },
  getWorld:()=>window.__ui.inWorld,
  getBase:()=>({level:1}),
  getMode:()=>window.__ui.mode,
  setMode,
  travel:{open:()=>{window.__ui.travelOpens++;}},
  message:(value)=>window.__ui.denied.push(value),
  signedIn:()=>true
});
window.__ui.ready=true;
`;
const fixture = markup +
  '<script type="module">'+init+'</script>' +
  '<script type="module" src="./homefront-graveyard-3d.js"></script>' +
  '</body></html>';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
  '.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary',
  '.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.woff2':'font/woff2'};
const clientRoot=resolve('client');
const observed=[];
const json=(res,status,payload)=>{
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(payload));
};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://localhost');
  try {
    if(url.pathname.startsWith('/api/homefront')) {
      const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      const account=token===TOKEN?ACCOUNT:null;
      observed.push({path:url.pathname,method:req.method,account});
      if(req.method!=='GET') return json(res,405,{error:'read_only_test_fixture'});
      const received=[];
      for await(const p of req) received.push(p);
      const raw=Buffer.concat(received).toString('utf8');
      const served=await Homefront.handle(req,res,url,{
        json,gate:()=>false,ip:'127.0.0.1',
        who:()=>account?{acct:account}:null,
        body:async()=>raw?JSON.parse(raw):{},store
      });
      if(!served) json(res,404,{error:'test_endpoint_not_found'});
      return;
    }
    if(url.pathname==='/arena/homefront-real-ui.html') {
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      res.end(fixture);return;
    }
    const path=resolve(clientRoot,'.'+decodeURIComponent(url.pathname));
    if(!path.startsWith(clientRoot+sep)) {res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);
    res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});
    res.end(bytes);
  }catch(e){
    console.error('read-only Three.js UI test server',String(e));
    if(!res.headersSent) json(res,500,{error:'test_server_failed'});else res.end();
  }
});
const out=process.env.HOMEFRONT_UI_ARTIFACTS||'homefront-ui-browser-output';
await mkdir(out,{recursive:true});
let browser;
try {
  // The experimental continuous-movement server flag is explicitly disabled.
  process.env.HOMEFRONT_CONTINUOUS_MOVEMENT='0';
  const port=await new Promise((ok,fail)=>{
    server.once('error',fail);
    server.listen(0,'127.0.0.1',()=>ok(server.address().port));
  });
  browser=await chromium.launch({headless:true,args:[
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist','--no-sandbox','--no-zygote'
  ]});
  const errors=[];
  async function inspect(context,name,minWidth,minHeight){
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(name+': '+error.message));
    await page.addInitScript(token=>localStorage.setItem('bcToken',token),TOKEN);
    await page.goto('http://127.0.0.1:'+port+'/arena/homefront-real-ui.html',
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__ui?.ready&&
      document.body.classList.contains('hf-playing'),{timeout:20000});
    await page.waitForFunction(()=>document.getElementById('graveyard3dStatus')
      ?.textContent?.includes('3D shared world live'),{timeout:60000});
    const canvas=page.locator('#graveyard3d canvas').first();
    assert(await canvas.isVisible(),name+': actual Three.js WebGL canvas mounted and visible');
    const box=await canvas.boundingBox();
    assert(box && box.width>minWidth && box.height>minHeight,
      name+': real scene fills the viewport '+JSON.stringify(box));
    assert.equal(await page.locator('header').evaluate(el=>getComputedStyle(el).display),
      'none','old HTML header does not surround real game');
    const status=await page.locator('#graveyard3dStatus').innerText();
    assert(status.includes('tap to travel · WASD/joystick to move'),
      'the continuous movement preview is not enabled in this test');
    const camera=page.locator('#graveyard3d .hf-viewbtn').first();
    assert(await camera.isVisible(),name+': real camera switch remains visible');
    await page.screenshot({path:out+'/'+name+'-real-graveyard.png'});
    const viewBox=await camera.boundingBox();
    const hudBox=await page.locator('#hfHud').boundingBox();
    const intersect=(a,b)=>a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&
      a.y<b.y+b.height&&a.y+a.height>b.y;
    assert(!intersect(viewBox,hudBox),name+': camera button does not overlap HUD');
    await camera.click();
    assert(/first-person/i.test(await camera.innerText()),
      name+': real Three.js camera toggles first-person');
    await camera.click();
    assert(/third-person/i.test(await camera.innerText()),
      name+': real Three.js camera returns to third-person');
    await page.locator('#hfHud .hf-menu').click();
    await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Inventory'}).click();
    assert(await page.locator('#hfSheet').isVisible(),name+': Inventory opens over real scene');
    assert(await canvas.isVisible(),name+': renderer remains mounted behind Inventory');
    await page.screenshot({path:out+'/'+name+'-real-inventory.png'});
    // Workbench and Management are forbidden in the PvP world. Selecting the
    // tab should neither enter a server action nor change the world mode.
    await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Build'}).click();
    assert.equal(await page.evaluate(()=>window.__ui.mode),'expedition',
      'Build cannot switch shared Wastes into private workshop');
    await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Manage'}).click();
    assert.equal(await page.evaluate(()=>window.__ui.mode),'expedition',
      'Manage cannot switch out of shared world without traveling');
    assert((await page.evaluate(()=>window.__ui.denied.length))>=2,
      'UI explains forbidden settlement actions in the expedition');
    await page.keyboard.press('Escape');
    assert(await page.locator('#hfSheet').isHidden(),
      name+': closing overlay restores real 3D interaction');
    assert(await canvas.isVisible(),name+': WebGL canvas remains after menu closing');
    return {page,box};
  }
  const desktop=await browser.newContext({viewport:{width:1280,height:800}});
  const first=await inspect(desktop,'desktop',1220,750);
  const phoneContext=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    deviceScaleFactor:1,serviceWorkers:'block'
  });
  const phone=await inspect(phoneContext,'mobile',380,810);
  const stick=phone.page.locator('#graveyard3d .hf-joy');
  assert(await stick.isVisible(),'actual mobile joystick stays visible');
  const a=await stick.boundingBox(),b=await phone.page.locator('#hfHud').boundingBox();
  assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),
    'actual mobile joystick does not overlap in-game HUD');
  assert(!observed.some(r=>r.method!=='GET'), 'real Three.js UI smoke sends no state mutation');
  assert(observed.some(r=>r.path==='/api/homefront/world'&&r.account===ACCOUNT),
    'the real Three.js client consumed an authorized server world snapshot');
  assert.deepEqual(errors,[],'no uncaught script exceptions during real WebGL HUD tests');
  console.log('HOMEFRONT IMMERSIVE REAL WEBGL SMOKE PASSED');
  console.log(JSON.stringify({desktop:first.box,mobile:phone.box,worldApiReadOnly:true,
    previewContinuousMovementOff:true,realThreeCanvas:true,
    realCameraToggle:true,inventoryOverlay:true,expeditionManageGuard:true,
    mobileRealJoystickNonoverlap:true,pageErrors:errors}));
  await phoneContext.close();await desktop.close();
}finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
}
