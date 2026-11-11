// Isolated real-game WebGL test: locktest is a synthetic verified LP fixture.
// Never connects a user wallet, performs XRPL writes or updates production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const requirePlaywright=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/package.json');
const {chromium,webkit}=requirePlaywright('playwright');
const engine=process.env.AMM_BROWSER==='webkit'?webkit:chromium;
const output=process.env.AMM_PREVIEW_OUTPUT||'amm-gold-vein-preview-output';
await mkdir(output,{recursive:true});
const browser=await engine.launch({headless:true,args:process.env.AMM_BROWSER==='webkit'?[]:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const issues=[],facts=[];
try{
 for(const v of [
  {name:'desktop',viewport:{width:1440,height:900},mobile:false},
  {name:'mobile',viewport:{width:390,height:844},mobile:true}
 ]){
  const context=await browser.newContext({viewport:v.viewport,isMobile:v.mobile,hasTouch:v.mobile,deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',e=>issues.push(v.name+': '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error|VALIDATE_STATUS|FRAGMENT|VERTEX_SHADER/i.test(m.text()))issues.push(v.name+': '+m.text());});
  await page.goto('http://127.0.0.1:8080/?debug=1&locktest=1',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.__ammGold?.mesh?.geometry?.attributes?.gShare&&window.__swirl?.n>0&&window.__ammLock?.test,{timeout:60000});
  await page.waitForTimeout(1500);
  const state=await page.evaluate(()=>{
   const gold=window.__ammGold.mesh,values=gold.geometry.getAttribute('gShare').array;
   const shares=[...new Set(Array.from(values).map(x=>Math.round(x*1000)/1000))];
   return {goldSegments:window.__ammGold.segments,goldType:gold.type,shareValues:shares,
    goldVeins:window.__swirl.veins?.length,spirals:window.__swirl.n,lockDraws:window.__ammLock.draws(),
    ringFree:window.__ammLock.objs?.every(m=>m.geometry?.type!=='TorusGeometry')??false,
    bodyColor:window.__swirl.paths?.[0]?.b?.actCol?.getHexString?.(),
    canvas:document.querySelectorAll('canvas').length};
  });
  assert(state.spirals>0,'actual tower spirals must exist');
  assert(state.goldSegments>=state.spirals,'continuous gold tubes include rail + tower sections');
  assert(state.shareValues.some(x=>x>.8),'verified 90.5% / 100% lock fixtures create a substantial solid core');
  assert(state.shareValues.includes(0),'unverified and zero-lock pools have zero gold');
  assert.equal(state.lockDraws,2,'lock halos were removed without touching token singularities');
  assert(state.ringFree,'AMM lock renderer contains no torus halo geometry');
  assert(state.canvas>0,'real world WebGL canvas renders');
  await page.screenshot({path:output+'/'+process.env.AMM_BROWSER+'-'+v.name+'.png',fullPage:false});
  facts.push({viewport:v.name,...state});
  await context.close();
 }
 assert.equal(issues.length,0,'no WebGL shader compilation errors');
 console.log(JSON.stringify({browser:process.env.AMM_BROWSER,results:facts,shaderErrors:issues},null,2));
 await writeFile(output+'/'+process.env.AMM_BROWSER+'-qa.json',JSON.stringify({results:facts,issues},null,2));
}finally{await browser.close();}
