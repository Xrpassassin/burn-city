// Real Three.js + immersive HUD browser smoke on a disposable localhost world.
// Unlike the layout fixture this loads the actual Graveyard WebGL renderer,
// world handlers, camera controls, and production HUD implementation.
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
const REFUGE_ACCOUNT = 'ui-refuge-test-only';
const REFUGE_TOKEN = 'ui-refuge-token';
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
    // Real Homefront requests the jetpack status on refuge load. This route
    // is deliberately a harmless read-only fixture, not a payment backend.
    if(url.pathname==='/api/jetpack') {
      if(req.method!=='GET')return json(res,405,{error:'read_only_test_fixture'});
      return json(res,200,{owned:{homefront:false},payments:false,
        prices:{homefront:{xrp:0}}});
    }
    if(url.pathname.startsWith('/api/homefront')) {
      const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      const account=token===TOKEN?ACCOUNT:token===REFUGE_TOKEN?REFUGE_ACCOUNT:null;
      observed.push({path:url.pathname,method:req.method,account});
      if (req.method !== 'GET' && (account !== REFUGE_ACCOUNT || req.method !== 'POST' ||
          !['/api/homefront/action', '/api/homefront/world/enter', '/api/homefront/world/leave'].includes(url.pathname)))
        return json(res,405,{error:'test_refuge_only'});
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
    if(url.pathname==='/arena/homefront-real-ui.html'||
       url.pathname==='/arena/homefront-real-refuge.html') {
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      res.end(url.pathname.endsWith('real-refuge.html')?original:fixture);return;
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
  browser=await chromium.launch({ executablePath:process.env.HOMEFRONT_CHROMIUM_PATH||undefined,headless:true,args:[
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist','--no-sandbox','--no-zygote'
  ]});
  const errors=[];
  const opening = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await opening.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === 'localhost' && route.request().resourceType() !== 'script'
      ? route.continue() : route.abort();
  });
  await opening.goto('http://localhost:'+port+'/arena/homefront-real-refuge.html');
  assert(await opening.locator('html').evaluate(html=>html.classList.contains('hf-shell')));
  assert.equal((await opening.locator('header').boundingBox()).height,844,'opening fills mobile viewport before module load');
  await opening.goto('http://localhost:'+port+'/arena/homefront-real-refuge.html?classic=1');
  assert(!(await opening.locator('html').evaluate(html=>html.classList.contains('hf-shell'))));
  await opening.close();
  async function inspect(context,name,minWidth,minHeight){
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(name+': '+error.message));
    await page.addInitScript(token=>localStorage.setItem('bcToken',token),TOKEN);
    // The real Homefront API resolver uses "localhost", not 127.0.0.1,
    // as its explicit local-site whitelist. Block EVERY nonlocal request.
    await page.route('**/*',route=>{
      const host=new URL(route.request().url()).hostname;
      if(host==='localhost'||host==='127.0.0.1') return route.continue();
      errors.push(name+': attempted nonlocal request '+host);
      return route.abort('blockedbyclient');
    });
    await page.goto('http://localhost:'+port+'/arena/homefront-real-ui.html',
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__ui?.ready&&
      document.body.classList.contains('hf-playing'),{timeout:20000});
    try {
      await page.waitForFunction(()=>document.getElementById('graveyard3dStatus')
        ?.textContent?.includes('3D shared world live'),null,{timeout:45000});
    } catch(error) {
      const diagnosis=await page.evaluate(()=>({
        ready:window.__ui?.ready,
        hud:document.body.className,
        status:document.getElementById('graveyard3dStatus')?.textContent,
        sceneSize:document.getElementById('graveyard3d')?.getBoundingClientRect().toJSON(),
        canvasCount:document.querySelectorAll('#graveyard3d canvas').length,
        htmlMode:document.body.className
      }));
      console.error('REAL_WEBGL_INIT_DIAGNOSTICS',JSON.stringify({
        name,diagnosis,requests:observed.slice(-25),pageErrors:errors.slice(-15)
      }));
      await page.screenshot({path:out+'/'+name+'-real-webgl-error.png'}).catch(()=>{});
      throw error;
    }
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
  await phoneContext.close();await desktop.close();

  // Full real Homefront HTML + its real, complete inline Three.js refuge module,
  // not just the separate Graveyard module from above. This login is synthetic
  // and receives an isolated blank base from the original GET handler.
  const touchRefuge = process.env.HOMEFRONT_UI_TOUCH_REFUGE === '1';
  const refugeName = touchRefuge ? 'mobile' : 'desktop';
  const viewport = touchRefuge ? {width:390,height:844} : {width:1280,height:800};
  const refugeContext=await browser.newContext({viewport,isMobile:touchRefuge,hasTouch:touchRefuge});
  const activate = (locator, options) => touchRefuge ? locator.tap(options) : locator.click(options);
  const refuge=await refugeContext.newPage();
  refuge.on('pageerror',error=>errors.push('refuge: '+error.message));
  await refuge.addInitScript(({token,account})=>{
    localStorage.setItem('bcToken',token);
    localStorage.setItem('bcAcct',account);
    localStorage.setItem('bcHomefrontTutorial:'+account,'seen');
  },{token:REFUGE_TOKEN,account:REFUGE_ACCOUNT});
  await refuge.route('**/*',route=>{
    const host=new URL(route.request().url()).hostname;
    if(host==='localhost'||host==='127.0.0.1')return route.continue();
    errors.push('refuge: attempted nonlocal request '+host);
    return route.abort('blockedbyclient');
  });
  await refuge.goto('http://localhost:'+port+'/arena/homefront-real-refuge.html?debug=1',
    {waitUntil:'domcontentloaded',timeout:60000});
  try {
    await refuge.waitForFunction(()=>{
      const text=document.getElementById('status')?.textContent||'';
      const game=document.getElementById('game');
      const canvas=document.querySelector('#world canvas');
      return text.includes('Refuge loaded')&&game&&!game.hidden&&!!canvas&&
        document.body.classList.contains('hf-playing');
    },null,{timeout:60000});
  }catch(error){
    console.error('REAL_REFUGE_DIAGNOSTICS',JSON.stringify({
      state:await refuge.evaluate(()=>({
        status:document.getElementById('status')?.textContent,
        gameHidden:document.getElementById('game')?.hidden,
        canvases:document.querySelectorAll('#world canvas').length,
        hud:!!document.querySelector('#hfHud'),
        mode:document.body.className
      })),
      requests:observed.filter(r=>r.account===REFUGE_ACCOUNT).slice(-25),
      errors:errors.slice(-15)
    }));
    await refuge.screenshot({path:out+'/real-refuge-error.png'}).catch(()=>{});
    throw error;
  }
  const yard=refuge.locator('#world canvas').first();
  const yardBox=await yard.boundingBox();
  assert(yardBox&&Math.abs(yardBox.width-viewport.width)<=1&&Math.abs(yardBox.height-viewport.height)<=1,
    'actual refuge WebGL renderer uses immersive viewport '+JSON.stringify(yardBox));
  assert(await refuge.locator('#hfHud').isVisible(),'real refuge loads unified HUD');
  if (touchRefuge) {
    const joystick = await refuge.locator('#world .hf-joy').boundingBox();
    assert(joystick,'the real refuge touch joystick is visible');
    const x = Math.round(joystick.x + joystick.width/2);
    const y = Math.round(joystick.y + joystick.height/2);
    const before = await refuge.evaluate(() => ({x:window.__hfYard.player.x,z:window.__hfYard.player.z}));
    const touch = await refugeContext.newCDPSession(refuge);
    try {
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y}]});
      await refuge.waitForFunction(({x,z}) => Math.hypot(window.__hfYard.player.x-x,window.__hfYard.player.z-z) > 0.4,before);
    } finally {
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await touch.detach();
    }
    await activate(refuge.locator('#hfHud .hf-menu'));
    await activate(refuge.getByRole('tab',{name:/Inventory/}));
    await refuge.setViewportSize({width:844,height:390});
    await refuge.waitForFunction(() => {
      const world = document.querySelector('#world canvas')?.getBoundingClientRect();
      const card = document.querySelector('#hfSheet .hf-card')?.getBoundingClientRect();
      return world?.width === 844 && world.height === 390 && card?.width > 0 &&
        card.left >= 0 && card.right <= 844 && card.bottom <= 390;
    });
    await refuge.screenshot({path:out+'/mobile-landscape-inventory.png'});
    await refuge.setViewportSize(viewport);
    await activate(refuge.getByRole('button',{name:'✕ Close',exact:true}));
  }
  await refuge.screenshot({path:out+'/'+refugeName+'-real-refuge.png'});
  await activate(refuge.locator('#hfHud .hf-menu'));
  await activate(refuge.locator('#hfSheet .hf-tabs button').filter({hasText:'Build'}));
  assert(await refuge.locator('#hfSheet #buildPanel').isVisible(),
    'real refuge Build controls are inside the overlay, not a separate page');
  assert(await yard.isVisible(),'real refuge Three.js canvas stays mounted behind Build');
  await refuge.screenshot({path:out+'/'+refugeName+'-real-refuge-build.png'});
  const buildOptions=refuge.locator('#hfSheet #buildings button').filter({hasText:'Choose placement'});
  assert(await buildOptions.count()>0,'real server refuge exposes placeable building cards');
  await activate(buildOptions.first());
  await refuge.waitForFunction(()=>document.getElementById('hfSheet')?.hidden,
    null,{timeout:10000});
  try {
    await refuge.locator('.hf-build-exit').waitFor({state:'visible',timeout:10000});
  }catch(error){
    console.error('REAL_REFUGE_PLACEMENT_DIAGNOSTICS',JSON.stringify(
      await refuge.evaluate(()=>({
        mode:document.body.className,
        panelHidden:document.getElementById('hfSheet')?.hidden,
        exitHidden:document.querySelector('.hf-build-exit')?.hidden,
        placing:document.getElementById('placementHelp')?.textContent,
        cancelHidden:document.getElementById('cancelPlacement')?.hidden
      }))));
    throw error;
  }
  assert(await refuge.locator('.hf-build-exit').isVisible(),
    'selected 3D construction exposes Finish building in world');
  assert(await refuge.locator('#cancelPlacement').isVisible(),
    'actual protected placement remains selected after drawer closes');
  assert(await yard.isVisible(),'real 3D yard is accessible for placement');
  await refuge.screenshot({path:out+'/'+refugeName+'-real-refuge-placement.png'});
  const buildRequests = () => observed.filter(r=>r.account===REFUGE_ACCOUNT&&r.path==='/api/homefront/action');
  assert.equal(buildRequests().length,0,'opening placement does not mutate the refuge');
  // Try clear yard positions within the overhead view until the genuine action fires.
  const buildReply = refuge.waitForResponse(r=>r.url().endsWith('/api/homefront/action')&&r.request().method()==='POST');
  for (const [x,y] of [[.64,.53],[.37,.62],[.64,.70],[.40,.34],[.55,.66]]) {
    if (!(await refuge.locator('#cancelPlacement').isVisible())) break;
    await activate(yard,{position:{x:yardBox.width*x,y:yardBox.height*y}});
  }
  const placed = await buildReply;
  assert(placed.ok(),'real server accepted structure placement');
  assert((await placed.json()).base?.structures?.length > 0,'the server returns the updated refuge');
  await activate(refuge.locator('.hf-build-exit'));
  await refuge.waitForFunction(()=>document.body.classList.contains('rpg-mode-home'));
  assert(await yard.isVisible(),'Finish building restores true third-person refuge');
  await activate(refuge.locator('#hfHud .hf-menu'));
  await activate(refuge.locator('#hfSheet .hf-tabs button').filter({hasText:'Manage'}));
  assert(await refuge.locator('#hfSheet .hf-mtabs button').count()>=4,
    'real settlement categories accessible inside the drawer');
  assert(await yard.isVisible(),'real 3D refuge remains mounted behind Manage');
  await refuge.screenshot({path:out+'/'+refugeName+'-real-refuge-manage.png'});
  if (touchRefuge) await activate(refuge.getByRole('button',{name:'✕ Close',exact:true}));
  else await refuge.keyboard.press('Escape');
  assert(await refuge.locator('#hfSheet').isHidden());
  assert(await yard.isVisible());
  assert.equal(buildRequests().length,1,'the structure was placed exactly once');
  const openTravel = async () => {
    await activate(refuge.locator('#hfHud .hf-menu'));
    await activate(refuge.locator('#hfSheet .hf-tabs button').filter({hasText:'Travel'}));
  };
  await openTravel();
  const entry = refuge.waitForResponse(r=>r.url().endsWith('/api/homefront/world/enter')&&r.request().method()==='POST');
  await activate(refuge.getByRole('button',{name:/Travel to the Wastes/}));
  assert((await (await entry).json()).self,'the server entered the Wastes');
  await refuge.waitForFunction(()=>document.body.classList.contains('rpg-mode-expedition'));
  assert(await refuge.locator('#graveyard3d canvas').isVisible());
  await openTravel();
  const exit = refuge.waitForResponse(r=>r.url().endsWith('/api/homefront/world/leave')&&r.request().method()==='POST');
  await activate(refuge.getByRole('button',{name:/Return to Homefront/}));
  const returned = await (await exit).json();
  assert(returned.base && !returned.self,'the server returned the player to the refuge');
  await refuge.waitForFunction(()=>document.body.classList.contains('rpg-mode-home'));
  await activate(refuge.getByRole('button',{name:'Back to refuge',exact:true}));
  await refuge.route('http://localhost:'+port+'/',route=>route.fulfill({contentType:'text/html',body:'<title>BURN City fixture</title>'}));
  await activate(refuge.locator('#hfHud .hf-menu'));
  await activate(refuge.getByRole('link',{name:'Return to BURN City'}));
  await refuge.waitForURL('http://localhost:'+port+'/');
  assert.deepEqual(errors,[],'no uncaught script exceptions during real refuge and Graveyard tests');
  console.log('HOMEFRONT IMMERSIVE REAL WEBGL SMOKE PASSED');
  console.log(JSON.stringify({desktop:first.box,mobile:phone.box,refuge:yardBox,
    touchRefuge,isolatedRefugePlacementAndTravel:true,previewContinuousMovementOff:true,realThreeCanvas:true,
    realRefugeCanvas:true,realRefugePlacementPreserved:true,realRefugeManagementOverlay:true,
    realCameraToggle:true,inventoryOverlay:true,expeditionManageGuard:true,
    mobileRealJoystickNonoverlap:true,pageErrors:errors}));
  await refugeContext.close();
}finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
}
