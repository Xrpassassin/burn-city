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
  await page.goto(BASE+'/?noguide=1&hubtest=1',{waitUntil:'domcontentloaded',timeout:90000});
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
  await page.locator('#bcMoveGamesOpen').click();
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
