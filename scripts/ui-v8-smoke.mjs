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
    hidden:el?.hidden,headline:el?.querySelector('.an-headline')?.textContent,level:el?.dataset.level,
    bar:rect('#aegisNews'),hud:rect('#hud'),toolbar:rect('#btns'),status:rect('#status'),recap:rect('#recap'),
    bodyClass:document.body.className,
    blockers:{gameBanner:!!document.querySelector('#evbanner.show'),toast:!!document.querySelector('#toasts .toast.in'),cityToast:!!document.querySelector('#cityToast div.on')},
    visibleStyle:getComputedStyle(el).visibility};
  });
  if(!news.hasCss||news.hidden||news.headline!=='Signal anomaly in BURN district'||news.level!=='2')
   fail(screen.name,'AEGIS news bar did not show high-priority headline');
  if(!news.bar||news.bar.left<-2||news.bar.right>screen.width+2||news.bar.top<-2||news.bar.bottom>screen.height+2)
   fail(screen.name,'AEGIS news is offscreen: '+JSON.stringify(news));
  for(const key of ['hud','toolbar','status','recap'])
   if(news[key]&&overlap(news.bar,news[key]))fail(screen.name,'AEGIS news overlaps '+key);
  if(screen.mobile&&screen.width<700&&screen.height>500){
   const placement=await page.evaluate(()=>{
    document.body.classList.add('mExplore');
    const ticker=document.querySelector('#aegisNews').getBoundingClientRect();
    const minimap=document.querySelector('#minimap').getBoundingClientRect();
    document.body.classList.remove('mExplore');
    return {ticker:{left:ticker.left,right:ticker.right,top:ticker.top,bottom:ticker.bottom},
      minimap:{left:minimap.left,right:minimap.right,top:minimap.top,bottom:minimap.bottom}};
   });
   if(overlap(placement.ticker,placement.minimap))
    fail(screen.name,'AEGIS news overlaps Explore minimap');
  }
  if(screen.mobile){
   const gearYield=await page.evaluate(()=>{
    const gear=document.querySelector('#gearBar'),rail=document.querySelector('#aegisNews');
    if(!gear||!rail)return null;
    gear.classList.add('on');
    const hidden=getComputedStyle(rail).visibility==='hidden';
    gear.classList.remove('on');
    return hidden;
   });
   if(gearYield===false)fail(screen.name,'AEGIS rail does not yield to touch gear controls');
  }
  await page.locator('#aegisNews .an-dismiss').click();
  if(!await page.locator('#aegisNews').evaluate(el=>el.hidden))
   fail(screen.name,'AEGIS snooze did not hide news');
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
  console.log('PASS',screen.name,'city shell + drawer + Estates');
  await context.close();
 }
 console.log('BURN City v8 responsive smoke passed across',screens.length,'viewports');
}finally{await browser.close()}
