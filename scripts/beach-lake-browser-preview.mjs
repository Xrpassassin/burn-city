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
  await page.evaluate(()=>{
    const r=document.getElementById('recap');if(r)r.style.display='none';
    const e=window.__estate, city=window.__city;
    if(!e||!city?.C||!city?.orbit)return;
    const k0=(e.lakeC.x-e.cityEdge.x)*e.dir.x+(e.lakeC.z-e.cityEdge.z)*e.dir.z-e.D;
    const junctionDist=Math.max(12,k0-34);
    const target=e.roadO.clone().addScaledVector(e.dir,junctionDist).addScaledVector(e.side,33);
    city.orbit.target.copy(target);
    city.C.position.copy(target).addScaledVector(e.dir,-65).addScaledVector(e.side,55).add(new city.C.position.constructor(0,65,0));
    city.C.lookAt(target);city.orbit.update?.();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({path:out+'/'+name+'.png'});
  console.log(name,JSON.stringify({status:resp?.status(),result,errors}));
  if(resp?.status()!==200||!result.ready||!result.canvas||!result.estate||errors.length)failed=true;
  await page.close();
 }
}finally{await browser.close()}
if(failed)process.exitCode=1;
