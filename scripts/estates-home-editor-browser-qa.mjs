// Real browser cross-platform Estates furnishing editor acceptance.
// Uses a fake save response and zero wallet/XRP writes. No live purchase.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const requirePlaywright=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/package.json');
const {chromium,webkit}=requirePlaywright('playwright');
const tag=process.env.HOME_EDITOR_BROWSER||'chromium',
  engine=tag==='webkit'?webkit:chromium,out=process.env.HOME_EDITOR_QA_OUTPUT||'estates-home-editor-qa';
await mkdir(out,{recursive:true});
const browser=await engine.launch({headless:true,args:tag==='webkit'?[]:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const results=[],errors=[];
try{
 for(const v of [{name:'desktop',width:1365,height:850,mobile:false},{name:'phone',width:390,height:844,mobile:true},{name:'small-phone',width:320,height:700,mobile:true}]){
  const ctx=await browser.newContext({viewport:{width:v.width,height:v.height},hasTouch:v.mobile,isMobile:v.mobile,deviceScaleFactor:1});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(v.name+': '+e.message));
  await page.goto('http://127.0.0.1:8080/arena/zombies-credits.html',{waitUntil:'domcontentloaded',timeout:40000});
  const initial=await page.evaluate(async()=>{
   document.body.innerHTML='<main id="home-editor-qa" style="padding:10px;max-width:100%;box-sizing:border-box"></main>';
   document.body.style.cssText='margin:0;min-width:0;background:#17242b;color:#f6eddc';
   document.documentElement.style.cssText='overflow-x:hidden;min-width:0';
   const {mountEstateHomeEditor}=await import('/js/estates-home-editor-ui.mjs');
   const state={ok:true,propertyId:'trailer-10',tier:'trailer',role:'owner',editable:true,layoutId:'cozy',
    layouts:[{id:'cozy',name:'Cozy Home',unlocked:true,priceXrp:0},{id:'open',name:'Open Living',unlocked:true,priceXrp:0},{id:'arcade-suite',name:'Arcade Social Suite',unlocked:false,priceXrp:9}],
    catalog:[{id:'chair',label:'Accent Chair'},{id:'plant',label:'Potted Plant'}],
    furniture:[{id:'chair-1',type:'chair',x:-.5,z:-.5,rotation:0}],dimensions:{halfX:2.6,halfZ:2.1}};
   localStorage.setItem('bcToken','qa-owner-token');
   const qa={state,requests:[],previews:[],saved:[],exits:0};
   const fetcher=async(url,opts)=>{qa.requests.push({url,opts});const payload=JSON.parse(opts.body);
    return {ok:true,json:async()=>({...state,...payload,ok:true,editable:true,costXrp:0})}};
   const mount=s=>mountEstateHomeEditor(document.getElementById('home-editor-qa'),s,{
    fetcher,storage:localStorage,onPreview:x=>qa.previews.push(x),onSaved:x=>qa.saved.push(x),onExit:()=>qa.exits++});
   qa.editor=mount(state);qa.mount=mount;window.__homeEditorQA=qa;
   return {mounted:!!qa.editor.root.isConnected,saveCount:qa.requests.length};
  });
  assert(initial.mounted);
  await page.locator('#home-editor-qa button').filter({hasText:'Accent Chair'}).first().click();
  await page.locator('#home-editor-qa button').filter({hasText:'→'}).first().click();
  let s=await page.evaluate(()=>window.__homeEditorQA.editor.current);
  assert.equal(s.furniture[0].x,0,'D-pad moves by 0.5m');
  await page.locator('#home-editor-qa canvas').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('r');
  s=await page.evaluate(()=>window.__homeEditorQA.editor.current);
  assert.equal(s.furniture[0].z,0);
  assert.equal(s.furniture[0].rotation,90,'keyboard rotates selected object');
  await page.keyboard.press('Control+z');
  s=await page.evaluate(()=>window.__homeEditorQA.editor.current);
  assert.equal(s.furniture[0].rotation,0,'undo reverses rotation');
  await page.locator('#home-editor-qa select').first().selectOption('open');
  const before=await page.evaluate(()=>window.__homeEditorQA.requests.length);
  assert.equal(before,0,'changes are preview only until explicit Save');
  const geometry=await page.evaluate(()=>{
   const box=document.querySelector('#home-editor-qa').getBoundingClientRect();
   const canvas=document.querySelector('#home-editor-qa canvas').getBoundingClientRect();
   const buttons=[...document.querySelectorAll('#home-editor-qa button')];
   const clips=buttons.filter(b=>{
    const r=b.getBoundingClientRect();return r.width>0&&(r.left<-1||r.right>innerWidth+1);
   });
   return {bodyWidth:document.documentElement.scrollWidth,screen:innerWidth,
    editorWidth:box.width,canvasWidth:canvas.width,
    touchButtons:buttons.filter(b=>parseFloat(getComputedStyle(b).minHeight)>=48).length,
    totalButtons:buttons.length,clipped:clips.map(b=>b.textContent.slice(0,25))};
  });
  assert.equal(geometry.clipped.length,0,'no furnishing buttons may escape viewport');
  assert(geometry.canvasWidth<=v.width,'floor grid never exceeds phone width');
  assert.equal(geometry.touchButtons,geometry.totalButtons,'all furniture controls are 48px touch targets');
  const clickGeometry=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('#home-editor-qa button')];
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,scroll:document.scrollingElement?.scrollHeight}};
    const save=buttons.find(e=>e.textContent.includes('Save design'));
    const other=buttons.filter(e=>e!==save);
    const a=save.getBoundingClientRect();
    return {save:rect(save),bodyHeight:document.body.scrollHeight,viewHeight:innerHeight,
      overlapping:other.filter(e=>{const c=e.getBoundingClientRect();return a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top;}).map(e=>({name:e.textContent,rect:rect(e)})),
      all:buttons.map(e=>({name:e.textContent,rect:rect(e)}))};
  });
  console.log('EDITOR_GEOMETRY',v.name,JSON.stringify(clickGeometry));
  await page.screenshot({path:out+'/'+tag+'-'+v.name+'-owner-designer.png',fullPage:true});
  // A real user must scroll down to Save on a 320px phone. The preceding
  // Chrome mobile emulation locator.scrollIntoViewIfNeeded occasionally
  // targeted a different row; validate the actual pixel hit target and tap it.
  const clickPoint=await page.evaluate(()=>{
    const save=[...document.querySelectorAll('#home-editor-qa button')].find(x=>x.textContent.includes('Save design · 0 XRP'));
    save.scrollIntoView({behavior:'instant',block:'center'});
    const rect=save.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    const hit=document.elementFromPoint(x,y);
    return {x,y,scrollY,innerHeight,hit:hit?.textContent,top:rect.top,bottom:rect.bottom};
  });
  console.log('EDITOR_SAVE_TARGET',v.name,JSON.stringify(clickPoint));
  assert(clickPoint.hit?.includes('Save design · 0 XRP'),
    'Save must be directly tappable after scrolling; no furniture button overlaps it');
  if(v.mobile)await page.touchscreen.tap(clickPoint.x,clickPoint.y);
  else await page.mouse.click(clickPoint.x,clickPoint.y);
  await page.waitForFunction(()=>window.__homeEditorQA.saved.length===1);
  const saved=await page.evaluate(()=>({
   requests:window.__homeEditorQA.requests.map(x=>({url:x.url,method:x.opts.method,payload:JSON.parse(x.opts.body)})),
   saved:window.__homeEditorQA.saved.length}));
  assert.equal(saved.requests.length,1);
  assert.equal(saved.requests[0].method,'POST');
  assert.equal(saved.requests[0].payload.propertyId,'trailer-10','new #605 trailer works with furniture editor');
  assert.equal(saved.requests[0].payload.layoutId,'open');
  assert.equal(saved.saved,1);
  const guest=await page.evaluate(()=>{
   const q=window.__homeEditorQA;
   q.editor.dispose();
   const guest=q.mount({...q.state,role:'guest',editable:false});
   const disabled=[...guest.root.querySelectorAll('button')].filter(b=>b.disabled);
   const explanation=guest.root.textContent;
   guest.dispose();
   return {disabled:disabled.length,explanation};
  });
  assert(guest.disabled>=7,'invited guests see a strictly read-only designer');
  assert.match(guest.explanation,/only the current owner/i);
  results.push({viewport:v.name,...geometry,guestReadOnly:true,writes:saved.requests.length});
  await ctx.close();
 }
 assert.deepEqual(errors,[],'no JS console exceptions');
 await writeFile(out+'/'+tag+'-results.json',JSON.stringify({browser:tag,results,errors},null,2));
 console.log(JSON.stringify({browser:tag,results,errors},null,2));
}finally{await browser.close()}
