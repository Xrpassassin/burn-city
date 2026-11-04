// Real Homefront HTML + WebGL against isolated guest HTTP routes: no Xaman,
// wallet, ledger, Fly.io, production persistence, or external host requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';

const require=createRequire(import.meta.url);
const {createGuestHandler}=require('../server/homefront-guest.js');
const {chromium}=require('playwright');
const guest=createGuestHandler();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../client');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript',
  '.css':'text/css','.json':'application/json','.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg',
  '.mp3':'audio/mpeg','.woff2':'font/woff2'};
const output=process.env.HOMEFRONT_UI_ARTIFACTS||'homefront-guest-browser-output';
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  const url=new URL(req.url||'/','http://localhost');
  const json=(_res,code,data)=>{
    res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});
    res.end(JSON.stringify(data));
  };
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
let browser;
const errors=[];
try{
  browser=await chromium.launch({headless:true,args:[
    '--no-sandbox','--no-zygote','--use-gl=angle',
    '--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'
  ]});
  async function inspect(name,viewport,phone=false){
    const context=await browser.newContext({viewport,isMobile:phone,hasTouch:phone,serviceWorkers:'block'});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(name+': '+e.message));
    await page.route('**/*',route=>{
      const uri=new URL(route.request().url());
      if(uri.hostname==='localhost'||uri.hostname==='127.0.0.1'||uri.protocol==='blob:')return route.continue();
      errors.push(name+' attempted external network '+uri.hostname);
      return route.abort();
    });
    await page.goto(origin+'/arena/homefront.html',{waitUntil:'domcontentloaded'});
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
      const response=await mod.fetchHomefront(location.origin,'/api/homefront');
      const result=await response.json();
      return {owner:result.base?.owner,day:result.base?.day,guest:mod.isGuest()};
    });
    const initial=await state();
    assert(initial.guest&&initial.owner?.startsWith('guest_'),'temporary guest refuge is live');
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
    await page.screenshot({path:output+'/'+name+'-guest-inventory.png'});
    await page.keyboard.press('Escape');
    assert(await page.locator('#hfSheet').isHidden());
    // A tab refresh must start an entirely new guest account. Wallet savings
    // are not affected and a guest has no server-side recovery credential.
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!document.getElementById('game')?.hidden &&
      (document.getElementById('status')?.textContent||'').includes('Playing as guest'),
      null,{timeout:60000});
    const reloaded=await state();
    assert.notEqual(reloaded.owner,initial.owner,
      'refresh discards guest progression rather than saving it');
    await context.close();
    return {name,viewport,ownerIsTemporary:true,reloadResets:true};
  }
  const desktop=await inspect('desktop',{width:1280,height:800});
  const mobile=await inspect('mobile',{width:390,height:844},true);
  assert.deepEqual(errors,[], 'guest mode does not throw JS errors or fetch external APIs');
  console.log('HOMEFRONT NO-WALLET REAL THREE.JS GUEST BROWSER PASSED',
    JSON.stringify({desktop,mobile,noWallet:true,productionApisBlocked:true}));
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
