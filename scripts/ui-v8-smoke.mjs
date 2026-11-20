// Optional browser QA for the BURN City v8 shell. Does not perform wallet writes.
// PLAYWRIGHT_DIR=/path/to/playwright node scripts/ui-v8-smoke.mjs http://localhost:8080
import {createRequire} from 'node:module';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const BASE=(process.argv[2]||'http://localhost:8080').replace(/\/$/,'');
const screens=[
 {name:'mobile-320',width:320,height:568,mobile:true},
 {name:'mobile-portrait',width:390,height:844,mobile:true},
 {name:'mobile-landscape',width:844,height:390,mobile:true},
 {name:'tablet',width:768,height:1024,mobile:true},
 {name:'desktop',width:1280,height:800,mobile:false}
];
const overlap=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
const fail=(name,message)=>{throw new Error(name+': '+message)};
const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try{
 for(const screen of screens){
  const context=await browser.newContext({viewport:{width:screen.width,height:screen.height},isMobile:screen.mobile,hasTouch:screen.mobile,serviceWorkers:'block'});
  const page=await context.newPage();
  page.on('pageerror',e=>console.warn('page error:',e.message.slice(0,150)));
  await page.goto(BASE+'/?noguide=1&hubtest=1&live=0&noaegis=1',{waitUntil:'domcontentloaded',timeout:90000});
  await page.locator('#bcMoveGamesOpen').waitFor({timeout:30000});
  await page.waitForTimeout(1200);
  const shell=await page.evaluate(()=>{
   const rect=id=>{
    const el=document.querySelector(id);
    if(!el||getComputedStyle(el).display==='none'||getComputedStyle(el).visibility==='hidden')return null;
    const r=el.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
   };
   return {hud:rect('#hud'),toolbar:rect('#btns'),status:rect('#status'),
    v8:!![...document.styleSheets].some(s=>s.href?.includes('ui-v8.css')),
    shared:!![...document.styleSheets].some(s=>s.href?.includes('burn-ui-tokens.css')),
    ember:getComputedStyle(document.documentElement).getPropertyValue('--bc-ember').trim(),
    cssWidth:document.documentElement.scrollWidth,innerWidth:innerWidth};
  });
  if(!shell.v8)fail(screen.name,'new visual shell was not loaded');
  if(!shell.shared||shell.ember!=='#ff8b39')fail(screen.name,'canonical design tokens missing');
  if(shell.cssWidth>shell.innerWidth+2)fail(screen.name,'horizontal page overflow');
  if(shell.hud&&shell.toolbar&&overlap(shell.hud,shell.toolbar))fail(screen.name,'HUD overlaps navigation');
  if(shell.status&&shell.toolbar&&overlap(shell.status,shell.toolbar))fail(screen.name,'status overlaps navigation');
  // AEGIS updates should fit the upper news rail, not interrupt the world as giant event banners.
  await page.evaluate(async()=>{
   const {updateAegisNewsFeed,publishAegisHeadline}=await import('./js/aegis-news.mjs');
   updateAegisNewsFeed({level:1,lines:['City Watch update one','City Watch update two']});
   publishAegisHeadline('Signal anomaly in BURN district',2);
  });
  const news=await page.evaluate(()=>{
   const el=document.querySelector('#aegisNews');
   const rect=id=>{
    const node=document.querySelector(id);if(!node||getComputedStyle(node).display==='none'||getComputedStyle(node).visibility==='hidden')return null;
    const b=node.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom};
   };
   return {hasCss:[...document.styleSheets].some(s=>s.href?.includes('aegis-news.css')),
    hidden:el?.hidden,headline:el?.querySelector('.an-headline')?.dataset.lead,level:el?.dataset.level,
    reserved:document.documentElement.classList.contains('aegis-ticker-on'),crawl:el?.dataset.motion==='crawl'&&!!el.querySelector('.an-track.an-go'),
    bar:rect('#aegisNews'),hud:rect('#hud'),toolbar:rect('#btns'),status:rect('#status'),recap:rect('#recap'),
    bodyClass:document.body.className,
    blockers:{gameBanner:!!document.querySelector('#evbanner.show'),toast:!!document.querySelector('#toasts .toast.in'),cityToast:!!document.querySelector('#cityToast div.on')},
    visibleStyle:getComputedStyle(el).visibility};
  });
  if(!news.hasCss||news.hidden||news.headline!=='Signal anomaly in BURN district'||news.level!=='2')
   fail(screen.name,'AEGIS ticker did not lead with the high-priority headline');
  // News-station ticker: a slim strip on the very top edge that reserves its own space.
  if(!news.bar||news.bar.left>1||news.bar.right<screen.width-1||news.bar.top>1||news.bar.bottom-news.bar.top>40)
   fail(screen.name,'AEGIS ticker is not a slim full-width top strip: '+JSON.stringify(news.bar));
  if(!news.reserved)fail(screen.name,'AEGIS ticker did not reserve its top strip');
  for(const key of ['hud','toolbar','status','recap'])
   if(news[key]&&overlap(news.bar,news[key]))fail(screen.name,'AEGIS ticker overlaps '+key);
  if(!news.crawl)fail(screen.name,'AEGIS ticker is not crawling');
  // Tapping the ticker expands every headline with AEGIS Command reachable.
  await page.locator('#aegisNews .an-headline').evaluate(el=>el.click());
  const panel=await page.evaluate(()=>{const p=document.querySelector('#aegisNewsPanel');const r=p.getBoundingClientRect();
   return {open:!p.hidden,items:p.querySelectorAll('li').length,cmd:!!p.querySelector('.an-open'),inView:r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
    paused:getComputedStyle(document.querySelector('#aegisNews .an-track')).animationPlayState};});
  if(!panel.open||panel.items!==3||!panel.cmd||!panel.inView||panel.paused!=='paused')
   fail(screen.name,'AEGIS ticker expand panel broken: '+JSON.stringify(panel));
  await page.locator('#aegisNews .an-close').evaluate(el=>el.click());
  if(screen.name==='mobile-portrait'){
   await page.emulateMedia({reducedMotion:'reduce'});
   const still=await page.evaluate(async()=>{const {updateAegisNewsFeed}=await import('./js/aegis-news.mjs');
    updateAegisNewsFeed({level:1,lines:['City Watch update one','City Watch update two','City Watch update three']});
    const el=document.querySelector('#aegisNews');return {motion:el.dataset.motion,anim:getComputedStyle(el.querySelector('.an-track')).animationName,runs:el.querySelectorAll('.an-run').length};});
   if(still.motion!=='static'||still.runs!==1||/anCrawl/.test(still.anim))fail(screen.name,'reduced motion still crawls: '+JSON.stringify(still));
   await page.emulateMedia({reducedMotion:'no-preference'});
  }
  if(!screen.mobile){
   const hit=await page.locator('#aegisNews .an-dismiss').evaluate(el=>{
    const r=el.getBoundingClientRect();
    const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return top===el||el.contains(top);
   });
   if(!hit)fail(screen.name,'AEGIS dismiss is obscured or not a hit target');
   // The 3D desktop renderer can make locator.click wait on an unrelated action;
   // the hit-test above verifies reachability and this checks the actual handler.
   await page.locator('#aegisNews .an-dismiss').evaluate(el=>el.click());
  }else await page.locator('#aegisNews .an-dismiss').click();
  if(!await page.locator('#aegisNews').evaluate(el=>el.hidden)||await page.evaluate(()=>document.documentElement.classList.contains('aegis-ticker-on')))
   fail(screen.name,'AEGIS snooze did not hide news and release the top strip');
  await page.evaluate(async()=>{
   const {publishAegisHeadline}=await import('./js/aegis-news.mjs');
   publishAegisHeadline('New response incident',2);
  });
  if(!await page.locator('#aegisNews').evaluate(el=>el.hidden))
   fail(screen.name,'AEGIS snooze did not respect new alerts');
  await page.locator('#bcMoveGamesOpen').click();
  // Measure final position after the short scale/fade entry animation, not an in-flight transform.
  await page.locator('#bcMoveGamesPanel .bc-mg-card').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const bounds=await page.locator('#bcMoveGamesPanel .bc-mg-card').boundingBox();
  if(!bounds||bounds.x<-2||bounds.y<-2||bounds.x+bounds.width>screen.width+2||bounds.y+bounds.height>screen.height+2){
   fail(screen.name,'movement and games drawer is offscreen: '+JSON.stringify(bounds));
  }
  await page.locator('#bcMoveGamesPanel .bc-mg-close').focus();
  await page.keyboard.press('Shift+Tab');
  if(!await page.evaluate(()=>document.querySelector('#bcMoveGamesPanel')?.contains(document.activeElement))){
   fail(screen.name,'reverse Tab escaped the modal');
  }
  await page.keyboard.press('Escape');
  if(await page.locator('#bcMoveGamesPanel').evaluate(el=>el.classList.contains('on'))){
   fail(screen.name,'Escape did not close the drawer');
  }
  // WAI-ARIA menu button: keyboard entry, roving focus, Escape and focus restoration.
  const moreButton=page.locator('#moreBtn');
  await moreButton.focus();
  await page.keyboard.press('ArrowDown');
  const menuOpen=await page.evaluate(()=>{
    const menu=document.querySelector('#more');
    const entries=[...menu.querySelectorAll('button[role="menuitem"]')]
      .filter(b=>!b.hidden&&getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden');
    return {open:menu.classList.contains('open'),count:entries.length,first:entries[0]===document.activeElement};
  });
  if(!menuOpen.open||!menuOpen.count||!menuOpen.first)fail(screen.name,'overflow menu keyboard opening or focus failed');
  await page.keyboard.press('End');
  const onLast=await page.evaluate(()=>{
    const xs=[...document.querySelectorAll('#more button[role="menuitem"]')]
      .filter(b=>!b.hidden&&getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden');
    return xs.at(-1)===document.activeElement;
  });
  if(!onLast)fail(screen.name,'End did not move focus to final action');
  await page.keyboard.press('Escape');
  if(await page.locator('#more').evaluate(el=>el.classList.contains('open')))fail(screen.name,'overflow Escape did not close');
  if(!await moreButton.evaluate(el=>el===document.activeElement))fail(screen.name,'overflow Escape did not restore focus');
  await moreButton.click();
  await page.locator('#bcMoveGamesOpen').click();
  if(await page.locator('#more').evaluate(el=>el.classList.contains('open')))fail(screen.name,'two top-level menus were open');
  if(!await page.locator('#bcMoveGamesPanel').evaluate(el=>el.classList.contains('on')))fail(screen.name,'games drawer did not replace secondary menu');
  await page.keyboard.press('Escape');
  await page.goto(BASE+'/estate-properties.html',{waitUntil:'domcontentloaded',timeout:90000});
  await page.locator('#estate-views').waitFor();
  const estate=await page.evaluate(()=>({
   v8:!![...document.styleSheets].some(s=>s.href?.includes('estate-theme.css')),
   shared:!![...document.styleSheets].some(s=>s.href?.includes('burn-ui-tokens.css')),
   ember:getComputedStyle(document.documentElement).getPropertyValue('--bc-ember').trim(),
   width:document.documentElement.scrollWidth,viewport:innerWidth,
   navHeight:document.querySelector('#estate-views')?.getBoundingClientRect().height||0,
   tabs:[...document.querySelectorAll('#estate-views [role=tab]')].length
  }));
  if(!estate.v8)fail(screen.name,'Estates theme was not loaded');
  if(!estate.shared||estate.ember!=='#ff8b39')fail(screen.name,'Estates missing shared design tokens');
  if(estate.width>estate.viewport+2)fail(screen.name,'Estates horizontal overflow');
  if(estate.navHeight>screen.height*.5)fail(screen.name,'Estates sticky navigation consumes half the screen');
  if(estate.tabs!==4)fail(screen.name,'Estates tabs are missing');
  if(await page.evaluate(()=>/^\s*\\n/.test(document.body.innerText)))fail(screen.name,'stray literal \\n text rendered at the top of Estates');
  if(screen.name==='desktop'){
   // Mock ONLY the Xaman identity endpoints in this isolated browser test.
   // No wallet is connected and no property reservation/payment is created.
   const testAcct='rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',testToken='signed-session-from-mocked-server';
   let starts=0,finishes=0,purchases=0,completeAuth=false;
   await page.route('**/api/signin',route=>{
    starts++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     sid:'SI'+'a'.repeat(24),xaman:{qr:'https://xumm.app/sign/qa_q.png',deeplink:'https://xumm.app/sign/qa'}
    })});
   });
   await page.route('**/api/signin/finish',route=>{
    finishes++;
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify(completeAuth?{ok:true,account:testAcct,token:testToken}:{ok:false,reason:'not_signed'})});
   });
   await page.route('**/api/estates**',route=>{
    if(/purchase\/(reserve|payment\/start)/.test(route.request().url()))purchases++;
    const url=new URL(route.request().url());
    const data=url.pathname.endsWith('/purchase/quote')
      ?{ok:true,priceDrops:'3000000',salesEnabled:false}
      :{ok:true,owned:[],distributionsEnabled:false,imgXrpProfitDistributionsEnabled:false};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.evaluate(async()=>{
    localStorage.removeItem('bcToken');localStorage.removeItem('bcAcct');
    const node=document.createElement('div');node.id='estate-signin-browser-fixture';
    document.body.append(node);
    const {mountEstatePurchase}=await import('./js/estate-purchase-ui.mjs');
    mountEstatePurchase(node,'qa-lot',{api:location.origin});
   });
   const signin=page.locator('#estate-signin-browser-fixture button').filter({hasText:'Sign in to purchase property'});
   await signin.click();
   await page.locator('#bcEstatesXaman .bc-xaman-open').waitFor({state:'visible'});
   const qr=await page.evaluate(()=>({
    link:document.querySelector('#bcEstatesXaman .bc-xaman-open')?.href,
    img:document.querySelector('#bcEstatesXaman .bc-xaman-qr img')?.src,
    token:localStorage.getItem('bcToken')
   }));
   if(qr.link!=='https://xumm.app/sign/qa'||qr.img!=='https://xumm.app/sign/qa_q.png'||qr.token)
    fail(screen.name,'Xaman SignIn modal did not show a real-format QR and deeplink without authenticating');
   await page.locator('#bcEstatesXaman .bc-xaman-close').click();
   if(await page.locator('#bcEstatesXaman').count()||await page.evaluate(()=>localStorage.getItem('bcToken')))
    fail(screen.name,'Cancelling Xaman sign-in did not close safely');
   completeAuth=true;
   await signin.click();
   await page.locator('#bcEstatesXaman .bc-xaman-open').waitFor({state:'visible'});
   await page.waitForFunction(token=>localStorage.getItem('bcToken')===token,testToken,{timeout:20000});
   await page.waitForFunction(()=>document.querySelector('#estate-signin-browser-fixture')?.textContent.includes('Purchases are currently disabled'),null,{timeout:15000});
   const auth=await page.evaluate(()=>({
    account:localStorage.getItem('bcAcct'),loginCount:[...document.querySelectorAll('#estate-signin-browser-fixture button')].filter(x=>/Sign in to purchase property/.test(x.textContent)).length,
    modal:!!document.querySelector('#bcEstatesXaman'),
    text:document.querySelector('#estate-signin-browser-fixture')?.textContent||''
   }));
   if(auth.account!==testAcct||auth.modal||auth.loginCount||!auth.text.includes('Purchases are currently disabled'))
    fail(screen.name,'Xaman approval did not refresh same-property server quote: '+JSON.stringify(auth));
   if(starts!==2||finishes<1||purchases)fail(screen.name,'Sign-in performed unexpected purchases or session calls');
   console.log('PASS desktop Estates Xaman sign-in cancellation, QR and verified session refresh');
  }

  console.log('PASS',screen.name,'city shell + drawer + Estates');
  await context.close();
 }
 console.log('BURN City v8 responsive smoke passed across',screens.length,'viewports');
}finally{await browser.close()}
