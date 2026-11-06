// Password-gated standalone Fly-preview image tested locally with the REAL
// Homefront HTML and Three.js. No external requests, wallets, or saved accounts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';

const pw='fake-local-preview-password-please-never-use-in-production';
const pl=requirePlaywright();
function requirePlaywright() {
  return createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/package.json')('playwright');
}
const { chromium }=pl;
const out=process.env.HOMEFRONT_UI_ARTIFACTS||'homefront-ui-browser-output';
await mkdir(out,{recursive:true});
const tmp=createServer();
tmp.listen(0,'127.0.0.1');
await once(tmp,'listening');
const port=tmp.address().port;
await new Promise(ok=>tmp.close(ok));
const proc=spawn(process.execPath,['scripts/homefront-preview-gateway.cjs'],{
  env:{...process.env,PORT:String(port),HOMEFRONT_PREVIEW_MODE:'1',
    HOMEFRONT_PREVIEW_PASSWORD:pw,HOMEFRONT_CONTINUOUS_MOVEMENT:'0',
    DRY_RUN:'true',BURN_JOB_IN_SERVER:'false',DATA_DIR:'/tmp/burn-preview-browser-'+port},
  stdio:['ignore','pipe','pipe']
});
let serverLog='';
proc.stdout.on('data',c=>{serverLog+=c;});
proc.stderr.on('data',c=>{serverLog+=c;});
const base='http://localhost:'+port;
let browser;
try{
  let ready=false;
  for(let i=0;i<100;i++){
    try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}
    if(proc.exitCode!==null)throw Error('Preview gateway exited '+serverLog);
    await new Promise(ok=>setTimeout(ok,150));
  }
  assert(ready,'Fly preview gateway is ready locally');
  browser=await chromium.launch({executablePath:process.env.HOMEFRONT_CHROMIUM_PATH||undefined,headless:true,args:[
    '--no-sandbox','--no-zygote','--use-gl=angle',
    '--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist'
  ]});
  const pageErrors=[];
  async function verify(viewport,name,phone=false){
    const context=await browser.newContext({
      viewport,isMobile:phone,hasTouch:phone,serviceWorkers:'block'
    });
    const page=await context.newPage();
    page.on('pageerror',err=>pageErrors.push(name+': '+err.message));
    // A 401 from the initial password challenge is expected; missing
    // optional procedural assets may 404 and fall back. CSP violations and
    // uncaught JavaScript errors are never expected.
    page.on('console',msg=>{
      if(msg.type()!=='error') return;
      if(/Content Security Policy|Refused to connect|Refused to load|violates.*directive/i.test(msg.text()))
        pageErrors.push(name+' CSP: '+msg.text().slice(0,250));
    });
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='localhost'||url.hostname==='127.0.0.1'||
        (url.protocol==='blob:'&&url.origin===base))
        return route.continue();
      pageErrors.push(name+': blocked nonlocal '+url.hostname);
      return route.abort('blockedbyclient');
    });
    await page.goto(base+'/arena/homefront.html',{waitUntil:'domcontentloaded'});
    assert(await page.locator('form[action="/preview-login"]').isVisible(),
      'access denied until preview-only password is entered');
    await page.locator('input[name=password]').fill(pw);
    await page.locator('form[action="/preview-login"] button').click();
    try{
      await page.waitForFunction(()=>document.getElementById('game')?.hidden===false &&
        document.body.classList.contains('hf-playing') &&
        !!document.querySelector('#world canvas') &&
        (document.getElementById('status')?.textContent||'').includes('Refuge loaded'),
        null,{timeout:60000});
    }catch(error){
      console.error('GATEWAY_BROWSER_DIAGNOSTICS',JSON.stringify({
        name,status:await page.locator('#status').textContent().catch(()=>null),
        location:page.url(),serverLog:serverLog.slice(-1300),
        errors:pageErrors
      }));
      await page.screenshot({path:out+'/'+name+'-preview-error.png'}).catch(()=>{});
      throw error;
    }
    assert(await page.locator('#homefrontPreviewMarker').isVisible(),
      'synthetic account / no payments marker is unmistakably shown');
    assert(await page.locator('#hfHud').isVisible(),'real Homefront HUD displayed');
    const yard=page.locator('#world canvas').first();
    const box=await yard.boundingBox();
    assert(box&&box.width>=viewport.width-5&&box.height>=viewport.height-6,
      'actual yard 3D renderer fills preview viewport: '+JSON.stringify(box));
    await page.screenshot({path:out+'/'+name+'-password-gated-real-refuge.png'});
    await page.locator('#hfHud .hf-menu').click();
    await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Build'}).click();
    assert(await page.locator('#hfSheet #buildPanel').isVisible(),
      "authenticated demo Build menu opens on 3D refuge");
    assert(await yard.isVisible(),'scene remains behind Build');
    await page.screenshot({path:out+'/'+name+'-password-gated-build.png'});
    await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Manage'}).click();
    assert(await page.locator('#hfSheet .hf-mtabs button').count()>=4,
      'original settlement management categories available');
    assert(await yard.isVisible(),'world remains mounted behind Manage');
    await page.keyboard.press('Escape');
    assert(await page.locator('#hfSheet').isHidden(),'Escape restores gameplay');
    const safe=await page.evaluate(async()=>{
      const resp=await fetch('/api/estates/status');
      return {status:resp.status,marker:document.querySelector('#homefrontPreviewMarker')?.textContent};
    });
    assert.equal(safe.status,404,'Fly preview gateway forbids real Estates APIs');
    if(phone){
      const joy=page.locator('#world .hf-joy');
      const joystickInfo=await page.evaluate(()=>{
        const el=document.querySelector('#world .hf-joy');
        const game=document.querySelector('#game'),world=document.querySelector('#world');
        return {coarse:matchMedia('(pointer: coarse)').matches,
          anyPointer:matchMedia('(any-pointer: coarse)').matches,
          maxTouchPoints:navigator.maxTouchPoints,mode:document.body.className,
          gameHidden:game?.hidden,worldSize:world?.getBoundingClientRect().toJSON(),
          joyExists:!!el,joyHidden:el?.hidden,
          joyDisplay:el?getComputedStyle(el).display:null,
          joyRect:el?.getBoundingClientRect().toJSON(),
          parentDisplay:el?getComputedStyle(el.parentElement).display:null};
      });
      console.log('HOMEFRONT_PREVIEW_MOBILE_JOYSTICK_DIAGNOSTICS',JSON.stringify(joystickInfo));
      // Protected construction hides touch controls. Resuming normal refuge
      // mode must restore them on a subsequent actual Three.js animation frame.
      const resumedAt=Date.now();
      try { await joy.waitFor({state:'visible',timeout:9000}); }
      catch(error) {
        console.error('HOMEFRONT_JOYSTICK_STUCK_HIDDEN',JSON.stringify(
          await page.evaluate(()=>({
            mode:document.body.className,
            joystickHidden:document.querySelector('#world .hf-joy')?.hidden,
            cameraHidden:document.querySelector('#world .hf-viewbtn')?.hidden,
            gameHidden:document.getElementById('game')?.hidden,
            sheetHidden:document.getElementById('hfSheet')?.hidden
          }))));
        throw error;
      }
      const resumeMs=Date.now()-resumedAt;
      console.log('HOMEFRONT_JOYSTICK_RECOVERY_MS',resumeMs);
      assert(await joy.isVisible(),'touch joystick returns after finishing protected construction');
      const rectA=await joy.boundingBox(),rectB=await page.locator('#hfHud').boundingBox();
      const hit=rectA.x<rectB.x+rectB.width&&rectA.x+rectA.width>rectB.x&&
        rectA.y<rectB.y+rectB.height&&rectA.y+rectA.height>rectB.y;
      assert(!hit,'real mobile movement joystick unobstructed by HUD');
      // A phone rotated into landscape has a much shorter usable height.
      // Exercise the SAME signed-in Three.js scene through ResizeObserver
      // instead of reloading a fixture with a fake canvas.
      await page.setViewportSize({width:844,height:390});
      await page.waitForFunction(()=>{
        const canvas=document.querySelector('#world canvas');
        const rect=canvas?.getBoundingClientRect();
        return rect&&rect.width>=839&&rect.height>=384 &&
          document.body.classList.contains('rpg-mode-home');
      },null,{timeout:15000});
      const landscapeWorld=await yard.boundingBox();
      const landscapeJoy=await joy.boundingBox();
      const landscapeHud=await page.locator('#hfHud').boundingBox();
      const camera=page.locator('#world .hf-viewbtn').first();
      assert(await camera.isVisible(),'rotated phone still exposes third-person camera control');
      const landscapeCamera=await camera.boundingBox();
      const overlaps=(a,b)=>!!a&&!!b&&a.x<b.x+b.width&&
        a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
      assert(!overlaps(landscapeJoy,landscapeHud),
        'landscape thumbstick does not overlap compact HUD');
      assert(!overlaps(landscapeCamera,landscapeHud),
        'landscape camera button does not overlap compact HUD');
      assert(landscapeJoy.x>=0&&landscapeJoy.y>=0&&
        landscapeJoy.x+landscapeJoy.width<=844&&
        landscapeJoy.y+landscapeJoy.height<=390,
        'landscape thumbstick remains within visible touch viewport');
      await page.screenshot({path:out+'/'+name+'-landscape-real-refuge.png'});
      await page.locator('#hfHud .hf-menu').click();
      await page.locator('#hfSheet .hf-tabs button').filter({hasText:'Inventory'}).click();
      assert(await page.locator('#hfSheet').isVisible(),
        'rotated phone can still open in-world Inventory');
      assert(await yard.isVisible(),
        'landscape Inventory does not unmount original Three.js scene');
      await page.keyboard.press('Escape');
      assert(await page.locator('#hfSheet').isHidden(),
        'landscape Escape returns to exploration');
      await page.setViewportSize({width:390,height:844});
      await page.waitForFunction(()=>{
        const rect=document.querySelector('#world canvas')?.getBoundingClientRect();
        return rect&&rect.width>=385&&rect.height>=838;
      },null,{timeout:15000});
      assert(await joy.isVisible(),
        'portrait recovery restores mobile movement after rotating twice');
      console.log('HOMEFRONT_PREVIEW_ROTATION_ACCEPTANCE',JSON.stringify({
        landscapeWorld,landscapeJoy,landscapeHud,landscapeCamera,
        restoredPortrait:true
      }));
    }
    await page.locator('#hfHud .hf-menu').click();
    const city=page.getByRole('link',{name:'Return to BURN City'});
    if(phone)await city.tap();else await city.click();
    await page.waitForURL(base+'/');
    const reopen=page.getByRole('link',{name:'Reopen Homefront'});
    assert(await reopen.isVisible(),'the game exits to the separate preview entrance');
    if(phone)await reopen.tap();else await reopen.click();
    await page.waitForURL(base+'/arena/homefront.html');
    assert(await page.locator('#homefrontPreviewMarker').isVisible(),'the same preview session can reopen the game');
    await context.close();
    return {world:{width:box.width,height:box.height},phone};
  }
  const desktop=await verify({width:1280,height:800},'desktop',false);
  const mobile=await verify({width:390,height:844},'mobile',true);
  assert.deepEqual(pageErrors,[],'no runtime errors or nonlocal browser traffic');
  console.log('HOMEFRONT PASSWORD-GATED PREVIEW BROWSER PASSED',
    JSON.stringify({desktop,mobile,syntheticGame:true,productionPaymentsBlocked:true,
      loginRequired:true,previewMarker:true,pageErrors}));
}finally{
  if(browser)await browser.close();
  proc.kill('SIGTERM');
  await Promise.race([once(proc,'exit'),new Promise(ok=>setTimeout(ok,2000))]);
}
