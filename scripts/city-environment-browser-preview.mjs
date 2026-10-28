import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const base=process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8080';
const dir=process.env.CITY_PREVIEW_OUT||'preview-output';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
let failed=false;
try {
 for(const [name,viewport,params] of [
   ['desktop',{width:1365,height:768},'?q=medium&noguide=1&live=0&view=street'],
   ['mobile',{width:390,height:844},'?q=low&noguide=1&live=0&view=street'],
   ['desktop-rollback',{width:1365,height:768},'?q=medium&noguide=1&live=0&view=street&nonature&nobirds']
 ]) {
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base+'/'+params,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(12000);
  // Dismiss the first-run recap, which otherwise obscures the city in screenshots.
  await page.evaluate(()=>{const recap=document.getElementById('recap');if(recap){const close=recap.querySelector('button,[role=button],.close');if(close)close.click();else recap.style.display='none'}});
  await page.waitForTimeout(1000);
  const state=await page.evaluate(()=>({
    ready:!!window.__ready,nature:window.__cityNature?{count:window.__cityNature.count,draws:window.__cityNature.draws}:null,
    birds:window.__cityBirds?{count:window.__cityBirds.count}:null,canvas:!!document.querySelector('canvas')
  }));
  await page.screenshot({path:dir+'/'+name+'.png',fullPage:false});
  console.log(name,JSON.stringify({status:response?.status(),state,errors}));
  if(response?.status()!==200||!state.canvas||errors.length>0)failed=true;
  if(name==='desktop'&&(!state.nature||!state.birds))failed=true;
  if(name==='mobile'&&(!state.nature||state.birds?.count!==0))failed=true;
  if(name==='desktop-rollback'&&(state.nature||state.birds))failed=true;
  await page.close();
 }
}finally{await browser.close()}
if(failed)process.exitCode=1;
