// Real Homefront HTML + WebGL against isolated guest HTTP routes: no Xaman,
// wallet, ledger, Fly.io, production persistence, or external host requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const {createGuestHandler}=require('../server/homefront-guest.js');
const {chromium}=require('playwright');
const guest=createGuestHandler();
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(project,'client');
// Run the ACTUAL CORS response function from production, but never boot the
// payment-enabled production HTTP server in this browser fixture.
const serverSource=await readFile(path.join(project,'server/server.js'),'utf8');
const corsStart=serverSource.indexOf('const ORIGINS = ');
const corsEnd=serverSource.indexOf('const gates =',corsStart);
assert(corsStart>=0&&corsEnd>corsStart);
const json=vm.runInNewContext(serverSource.slice(corsStart,corsEnd)+'\njson;',Object.create(null));
let preflightCount=0;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
  '.css':'text/css','.json':'application/json','.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg',
  '.mp3':'audio/mpeg','.woff2':'font/woff2'};
const output=process.env.HOMEFRONT_UI_ARTIFACTS||'homefront-guest-browser-output';
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const url=new URL(req.url||'/','http://localhost');
  if(req.method==='OPTIONS'){
    if(url.pathname.startsWith('/api/homefront/guest'))preflightCount++;
    json(res,204,{});
    return;
  }
  const body=async()=>{
    let raw='';
    for await(const chunk of req){
      raw+=chunk;
      if(raw.length>8000)throw Error('big');
    }
    return raw?JSON.parse(raw):{};
  };
  try{
    if(url.pathname.startsWith('/api/')){
      // Browser-only synthetic Xaman flow: verify the real in-world Account
      // button can reveal QR, but never grant a wallet, token or real save.
      if(url.pathname==='/api/signin'&&req.method==='POST')return json(res,200,{
        sid:'synthetic-login-not-a-real-wallet',
        xaman:{qr:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==',
          deeplink:'https://invalid.example/never-open'}
      });
      if(url.pathname==='/api/signin/finish'&&req.method==='POST')return json(res,200,{ok:false});
      if(await guest.handle(req,res,url,{json,gate:()=>false,ip:'127.0.0.1',body}))return;
      return json(res,404,{error:'no_production_apis_in_guest_browser'});
    }
    if(req.method!=='GET')return json(res,405,{error:'method_not_allowed'});
    const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    const ext=path.extname(target);
    if(!target.startsWith(root+path.sep)||!mime[ext])
      return json(res,404,{error:'asset_unavailable'});
    const data=await readFile(target);
    res.writeHead(200,{'content-type':mime[ext],'cache-control':'no-store'});
    res.end(data);
  }catch(error){json(res,400,{error:'test_request_failed'});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://localhost:'+server.address().port;
const crossOriginApi='http://127.0.0.1:'+server.address().port;
let browser;
const errors=[];
try{
  browser=await chromium.launch({headless:true,args:[
    '--no-sandbox','--no-zygote','--use-gl=angle',
    '--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'
  ]});
  async function inspect(name,viewport,phone=false,crossOrigin=false){
    const context=await browser.newContext({viewport,isMobile:phone,hasTouch:phone,serviceWorkers:'block'});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(name+': '+e.message));
    await page.route('**/*',route=>{
      const uri=new URL(route.request().url());
      if(uri.hostname==='localhost'||uri.hostname==='127.0.0.1'||uri.protocol==='blob:')return route.continue();
      errors.push(name+' attempted external network '+uri.hostname);
      return route.abort();
    });
    await page.goto(origin+'/arena/homefront.html'+
      (crossOrigin?'?api='+encodeURIComponent(crossOriginApi):''),
      {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.getElementById('game')?.hidden &&
      !!document.querySelector('#world canvas') &&
      document.body.classList.contains('hf-playing') &&
      (document.getElementById('status')?.textContent||'').includes('Playing as guest'),
      null,{timeout:60000});
    const box=await page.locator('#world canvas').first().boundingBox();
    assert(box&&box.width>=viewport.width-6&&box.height>=viewport.height-8,
      'guest sees actual fullscreen Three.js refuge on '+name+': '+JSON.stringify(box));
    assert.match(await page.locator('#signin').innerText(),/connect wallet to save/i);
    assert.equal(await page.evaluate(()=>localStorage.getItem('bcToken')),null,
      'guest gameplay never creates a wallet login token');
    const state=async()=>page.evaluate(async()=>{
      const mod=await import('/arena/homefront-guest.mjs');
      const api=new URLSearchParams(location.search).get('api')||location.origin;
      const response=await mod.fetchHomefront(api,'/api/homefront');
      const result=await response.json();
      return {owner:result.base?.owner,day:result.base?.day,guest:mod.isGuest(),
        responseType:response.type,apiOrigin:new URL(api).origin,appOrigin:location.origin};
    });
    const initial=await state();
    assert(initial.guest&&initial.owner?.startsWith('guest_'),'temporary guest refuge is live');
    assert.equal(initial.apiOrigin!==initial.appOrigin,crossOrigin,
      'the guest browser test actually requests the intended API origin');
    assert.equal(initial.responseType,crossOrigin?'cors':'basic',
      'Chromium successfully reads a cross-origin guest API response');
    // Prove interactive game actions work without wallet authentication, but
    // never become an account save after a browser refresh.
    const worked=await page.evaluate(async()=>{
      const mod=await import('/arena/homefront-guest.mjs');
      const api=new URLSearchParams(location.search).get('api')||location.origin;
      const response=await mod.fetchHomefront(api,'/api/homefront/action',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:{type:'workday'}})
      });
      return {status:response.status,data:await response.json()};
    });
    assert.equal(worked.status,200,'guest can perform a real settlement action');
    assert(worked.data.base.day>initial.day,
      'guest work shift changes authoritative in-session gameplay');

    // Real first-run Homefront displays its existing tutorial. Complete the
    // onboarding as a player would before testing the HUD underneath.
    const tutorial=page.locator('#homefrontModal');
    if(await tutorial.isVisible()){
      assert.match(await page.locator('#homefrontModalTitle').innerText(),/first refuge/i);
      await page.locator('#homefrontModalActions button').filter({hasText:'Enter Homefront'}).click();
      assert(await tutorial.isHidden(),'tutorial allows a guest to enter real gameplay');
    }
    await page.screenshot({path:output+'/'+name+'-guest-refuge.png'});
    await page.locator('#hfHud .hf-menu').click();
    await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Inventory'}).click();
    assert(await page.locator('#hfSheet').isVisible(),'guest can access in-world inventory');
    assert(await page.locator('#world canvas').first().isVisible(),'menu never removes real 3D scene');
    assert.match(await page.locator('#hfSheet .hf-panel-header').innerText(),/GUEST \(UNSAVED\)/,
      'fullscreen menu labels temporary guest progress explicitly');
    assert.match(await page.locator('#hfSheet .hf-panel-header .hf-actions').innerText(),/Connect wallet to save/,
      'wallet save action is reachable in the immersive menu');
    await page.screenshot({path:output+'/'+name+'-guest-inventory.png'});
    await page.keyboard.press('Escape');
    assert(await page.locator('#hfSheet').isHidden());
    if(!phone){
      await page.locator('#hfHud .hf-menu').click();
      await page.locator('#hfSheet .hf-panel-header .hf-actions button')
        .filter({hasText:'Connect wallet to save'}).click();
      await page.locator('#qrbox .qr img').waitFor({state:'visible',timeout:10000});
      assert(await page.locator('#qrbox').isVisible(),
        'actual guest Account action opens the Xaman QR above 3D world');
      assert(await page.locator('#world canvas').first().isVisible(),
        'wallet QR does not unmount the live third-person scene');
      await page.screenshot({path:output+'/'+name+'-guest-xaman-mock-flow.png'});
      await page.locator('#hideWalletQr').click();
      assert(await page.locator('#qrbox').isHidden(),
        'the real QR flow can be dismissed without authenticating');
      assert.equal(await page.evaluate(()=>localStorage.getItem('bcToken')),null,
        'synthetic QR check cannot grant wallet access');
    }
    // Test the real wallet dialog DOM and CSS without making a Xaman request
    // or connecting any account to the isolated guest browser fixture.
    await page.evaluate(()=>{document.getElementById('qrbox').hidden=false;});
    assert(await page.locator('#qrbox').isVisible(),'wallet QR is visible above the real 3D scene');
    const walletOverlay=await page.locator('#qrbox').evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {top:r.top,width:r.width,height:r.height,z:Number(getComputedStyle(el).zIndex)};
    });
    assert(walletOverlay.z>=80 && walletOverlay.width>=viewport.width-6 &&
      walletOverlay.height>=viewport.height-6,
      'wallet QR covers fullscreen WebGL rather than appearing behind it');
    assert.match(await page.locator('#qrbox').innerText(),/Guest progress.*will not transfer/,
      'wallet dialog must warn that guest gameplay will not be imported');
    await page.screenshot({path:output+'/'+name+'-guest-wallet-overlay.png'});
    await page.keyboard.press('Escape');
    assert(await page.locator('#qrbox').isHidden(),
      'Escape dismisses the wallet dialog without leaving Homefront');
    await page.evaluate(()=>{document.getElementById('qrbox').hidden=false;});
    await page.locator('#hideWalletQr').click();
    assert(await page.locator('#qrbox').isHidden(),
      'guest can dismiss wallet QR with the explicit continue-playing button');
    assert(await page.locator('#world canvas').first().isVisible(),
      'dismissing the wallet dialog preserves the live WebGL scene');
    // A tab refresh must start an entirely new guest account. Wallet savings
    // are not affected and a guest has no server-side recovery credential.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.getElementById('game')?.hidden &&
      (document.getElementById('status')?.textContent||'').includes('Playing as guest'),
      null,{timeout:60000});
    const reloaded=await state();
    assert.notEqual(reloaded.owner,initial.owner,
      'refresh discards guest progression rather than saving it');
    assert.equal(reloaded.day,initial.day,
      'unsaved guest workday does not persist across reload');
    // Fake ONLY the expiry response for an intentionally marked request.
    // The normal browser client still performs the real guest transport,
    // sees a server-style 401 and opens the explicit recovery UI.
    await page.route('**/api/homefront/guest?expiry_probe=1',route=>
      route.fulfill({status:401,contentType:'application/json',
        headers:{'access-control-allow-origin':origin,'cache-control':'no-store'},
        body:JSON.stringify({error:'guest_session_expired'})}));
    const responseCode=await page.evaluate(async()=>{
      const mod=await import('/arena/homefront-guest.mjs');
      const api=new URLSearchParams(location.search).get('api')||location.origin;
      const result=await mod.fetchHomefront(api,
        '/api/homefront?expiry_probe=1');
      return result.status;
    });
    assert.equal(responseCode,401,'guest API expiry propagates as a failed request');
    await page.locator('#homefrontModalTitle').filter({hasText:'Guest session ended'})
      .waitFor({state:'visible'});
    assert(await page.locator('#game').isHidden(),
      'expired guest is removed from the stale interactive 3D game');
    assert.match(await page.locator('#homefrontModalBody').innerText(),
      /progress is never saved or transferred/,
      'expiry warning discloses unsaved guest progress loss');
    await page.screenshot({path:output+'/'+name+'-guest-session-expired.png'});
    await page.locator('#homefrontModalActions button')
      .filter({hasText:'Start new guest refuge'}).click();
    await page.waitForFunction(()=>document.getElementById('game')?.hidden===false &&
      (document.getElementById('status')?.textContent||'').includes('Playing as guest'),
      null,{timeout:60000});
    const restarted=await state();
    assert.notEqual(restarted.owner,reloaded.owner,
      'explicit restart creates a brand-new temporary refuge');
    await context.close();
    return {name,viewport,ownerIsTemporary:true,reloadResets:true,expiryRecovery:true};
  }
  const desktop=await inspect('desktop',{width:1280,height:800});
  const mobile=await inspect('mobile',{width:390,height:844},true);
  const crossOrigin=await inspect('cross-origin',{width:1024,height:768},false,true);
  // Explicitly verify the actual production CORS response over HTTP. Some
  // Playwright route-interception configurations suppress implicit OPTIONS
  // traffic, so a preflight *count* is not reliable proof of browser CORS.
  const preflight=await fetch(crossOriginApi+'/api/homefront/guest',{
    method:'OPTIONS',headers:{
      origin,'access-control-request-method':'GET',
      'access-control-request-headers':'x-homefront-guest'
    }
  });
  assert.equal(preflight.status,204,'cross-origin OPTIONS returns success');
  assert.equal(preflight.headers.get('access-control-allow-origin'),origin,
    'server replies with the actual GitHub-style game origin');
  assert(preflight.headers.get('access-control-allow-headers')?.includes('x-homefront-guest'),
    'OPTIONS permits guest capability header');
  assert(preflightCount>0,'explicit real HTTP preflight reached the server');
  assert.deepEqual(errors,[], 'guest mode does not throw JS errors or fetch external APIs');
  console.log('HOMEFRONT NO-WALLET REAL THREE.JS GUEST BROWSER PASSED',
    JSON.stringify({desktop,mobile,crossOrigin,preflightCount,noWallet:true,productionApisBlocked:true}));
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
