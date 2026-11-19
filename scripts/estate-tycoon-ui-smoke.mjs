// Read-only DOM smoke: all API responses are local fixtures, no wallet or XRP operations.
import {createRequire} from 'node:module';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const base=(process.argv[2]||'http://127.0.0.1:8080').replace(/\/$/,'');
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 await page.goto(base+'/estate-properties.html',{waitUntil:'domcontentloaded'});
 await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test-root"></main></body></html>');
 const result=await page.evaluate(async()=>{
  const {mountEstateTycoon}=await import('/js/estate-tycoon-ui.mjs');
  const item={id:'porch-lights',name:'Porch & path lights',category:'decor',priceXrp:3,shareUnitsDelta:1,requires:[],eligibleTiers:[]};
  const state={propertyId:'trailer-01',tier:'trailer',owned:true,baseValueDrops:3000000,recordedValueDrops:3000000,
   recordedShareUnits:1,upgradeShareUnits:0,unlockedItemIds:[],ownerAuthorized:true,
   purchasesEnabled:false,purchaseStatus:'not_activated',items:[item],pending:null};
  const steps=[],storage={getItem:key=>key==='bcToken'?'test-token':null};
  let validate=false,confirmed=0;
  const response=(value,status=200)=>({ok:status<400,status,json:async()=>value});
  const fetcher=async(url,options={})=>{
   const path=new URL(url,location.origin).pathname;
   if(path.endsWith('/state'))return response({...state,items:[item]});
   if(path.endsWith('/quote'))return response({ok:true,canPurchase:state.ownerAuthorized&&state.purchasesEnabled&&!state.pending,purchasesEnabled:state.purchasesEnabled,pending:state.pending,purchaseStatus:state.purchaseStatus});
   if(path.endsWith('/start')){steps.push('start');return response({ok:true,orderId:'tycoon_test',deeplink:'https://xumm.app/sign/test'});}
   if(path.endsWith('/confirm')){
    steps.push('confirm');
    return response(validate?{ok:true,property:{...state}}:{ok:false,pending:true,error:'tycoon_payment_pending'},validate?200:202);
   }
   throw Error('Unexpected request: '+path);
  };
  const root=document.getElementById('test-root');
  const section=mountEstateTycoon(root,'trailer-01',{fetcher,storage,onConfirmed:()=>confirmed++,onPreview:()=>true});
  const assert=(ok,message)=>{if(!ok)throw Error(message)};
  const hasButton=text=>[...section.querySelectorAll('button')].find(b=>b.textContent===text);
  const settle=()=>new Promise(r=>setTimeout(r,50));
  await section.refresh();
  assert(section.querySelector('[data-tycoon-availability]')?.textContent.includes('not been activated'),'disabled purchase status is missing');
  assert(!hasButton('Buy'),'disabled purchase rendered a payable Buy action');
  state.purchaseStatus='treasury_paused';
  await section.refresh();
  assert(section.querySelector('[data-tycoon-availability]')?.textContent.includes('temporarily paused'),'treasury pause not distinguished from activation');
  state.ownerAuthorized=false;state.purchaseStatus='available';state.purchasesEnabled=true;
  await section.refresh();
  assert(section.querySelector('[data-tycoon-availability]')?.textContent.includes('wallet that owns'),'missing owner guidance');
  assert(!hasButton('Buy'),'nonowner saw Buy action');
  state.ownerAuthorized=true;
  await section.refresh();
  assert(!!hasButton('Buy'),'eligible owner cannot begin a purchase');
  hasButton('Buy').click();await settle();
  assert(steps.filter(s=>s==='start').length===1,'purchase did not invoke start exactly once');
  assert(section.querySelector('a[href="https://xumm.app/sign/test"]'),'Xaman request link not presented');
  assert(hasButton('Check payment'),'no payment status check after starting');
  hasButton('Check payment').click();await settle();
  assert(confirmed===0,'unvalidated payment credited property');
  assert(section.textContent.includes('No upgrade was credited'),'pending state not explained');
  assert(hasButton('Check payment again'),'pending status removed the retry button');
  assert(section.querySelector('.bc-ty-order[data-phase="checking"] [aria-current="step"]')?.textContent==='Ledger check','pending validation is not shown as the ledger-check step');
  assert(section.querySelector('a[href="https://xumm.app/sign/test"]'),'pending status removed the Xaman link');
  validate=true;
  hasButton('Check payment again').click();await settle();
  assert(confirmed===1,'verified payment not surfaced to owner');
  assert(section.querySelector('.bc-ty-order[data-phase="settled"]'),'settled purchase has no installed confirmation card');
  state.pending={orderId:'tycoon_test',itemId:'porch-lights',expiresAt:Date.now()+600000};
  await section.refresh();
  assert(hasButton('Continue existing Xaman request'),'pending Xaman link cannot be resumed');
  hasButton('Continue existing Xaman request').click();await settle();
  assert(steps.filter(s=>s==='start').length===2,'resume did not reuse the existing-order API');
  state.pending={...state.pending,expiresAt:Date.now()-1000};
  await section.refresh();
  assert(!hasButton('Continue existing Xaman request'),'expired order incorrectly offered a fresh payment link');
  assert(hasButton('Check existing payment'),'expired order has no reconciliation action');
  assert(section.querySelector('.bc-ty-order[data-phase="expired"]')?.textContent.includes('released automatically'),'expired order does not explain automatic release');
  return {ok:true,steps,confirmed};
 });
 if(!result.ok)throw Error('UI smoke returned an invalid result');
 console.log('PASS Estates Tycoon UI: activation/pause/wallet status, payment handoff, pending validation, recovery and expired-order safety');
 await page.close();
} finally {await browser.close();}
