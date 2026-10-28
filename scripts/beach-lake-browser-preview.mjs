import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const out='beach-preview-output';mkdirSync(out,{recursive:true});let failed=false;
try{
 for(const [name,width,height,q] of [['desktop',1365,768,'medium'],['mobile',390,844,'low']]){
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const resp=await page.goto('http://127.0.0.1:8080/?noguide=1&live=0&q='+q+'&view=street',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(14000);
  const result=await page.evaluate(()=>({ready:!!window.__ready,canvas:!!document.querySelector('canvas'),estate:!!window.__estate,road:window.__estate?{length:window.__estate.roadLen,offset:window.__estate.hwOff}:null}));
  await page.evaluate(()=>{const r=document.getElementById('recap');if(r)r.style.display='none'});
  await page.screenshot({path:out+'/'+name+'.png'});
  console.log(name,JSON.stringify({status:resp?.status(),result,errors}));
  if(resp?.status()!==200||!result.ready||!result.canvas||!result.estate||errors.length)failed=true;
  await page.close();
 }
}finally{await browser.close()}
if(failed)process.exitCode=1;
