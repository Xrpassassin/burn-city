// Read-only DOM smoke for the multi-upgrade cart (fixtures only; no wallet or XRP operations).
// One cart → one quote (itemIds) → one start (itemIds, no client prices) → one Xaman request →
// one confirm that installs every item. Prerequisites can come from the cart; removing one cascades.
import {createRequire} from 'node:module';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const base=(process.argv[2]||'http://127.0.0.1:8080').replace(/\/$/,'');
const shots=process.env.SHOT_DIR||'';
const browser=await chromium.launch();
try{
 for(const vp of [{name:'phone',width:390,height:844},{name:'desktop',width:1280,height:900}]){
  const page=await browser.newPage({viewport:{width:vp.width,height:vp.height},serviceWorkers:'block'});
  await page.goto(base+'/estate-properties.html',{waitUntil:'domcontentloaded'});
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#10141a;color:#f7f4f0;font-family:system-ui}main{max-width:560px;margin:0 auto;padding:16px}</style></head><body><main id="test-root"></main></body></html>');
  const out=await page.evaluate(async()=>{
   const {mountEstateTycoon}=await import('/js/estate-tycoon-ui.mjs');
   const items=[
    {id:'flower-garden',name:'Flower garden',category:'decor',priceXrp:3,shareUnitsDelta:1,requires:[],eligibleTiers:[]},
    {id:'fire-pit',name:'Backyard fire pit',category:'decor',priceXrp:6,shareUnitsDelta:2,requires:[],eligibleTiers:[]},
    {id:'garden-pond',name:'Garden pond',category:'decor',priceXrp:9,shareUnitsDelta:3,requires:['flower-garden'],eligibleTiers:[]},
    {id:'estate-helicopter',name:'Estate helicopter & private helipad',category:'aviation',priceXrp:60,shareUnitsDelta:20,requires:[],eligibleTiers:['family','mansion']}];
   const state={propertyId:'trailer-01',tier:'trailer',owned:true,baseValueDrops:3e6,upgradeValueDrops:0,recordedValueDrops:3e6,recordedShareUnits:1,upgradeShareUnits:0,
    unlockedItemIds:[],ownerAuthorized:true,purchasesEnabled:true,purchaseStatus:'available',items,pending:null,sharePolicy:'active_for_distributions'};
   const calls=[];let validate=false,confirmed=0;
   const response=(v,status=200)=>({ok:status<400,status,json:async()=>v});
   const fetcher=async(url,o={})=>{const u=new URL(url,location.origin),path=u.pathname;
    if(path.endsWith('/state'))return response({...state});
    if(path.endsWith('/quote')){calls.push({quote:u.searchParams.get('itemIds')||u.searchParams.get('itemId')});
     return response({ok:true,canPurchase:true,purchasesEnabled:true,pending:null,itemId:'cart:flower-garden+fire-pit+garden-pond'});}
    if(path.endsWith('/start')){calls.push({start:JSON.parse(o.body)});return response({ok:true,orderId:'tycoon_'+'a'.repeat(40),deeplink:'https://xumm.app/sign/1289e9ae-7d5d-4d5f-b89c-18633112ce09',qr:'https://xumm.app/sign/1289e9ae-7d5d-4d5f-b89c-18633112ce09_q.png'});}
    if(path.endsWith('/confirm')){calls.push({confirm:JSON.parse(o.body)});
     if(!validate)return response({ok:false,pending:true,error:'tycoon_payment_pending'},202);
     Object.assign(state,{unlockedItemIds:['flower-garden','fire-pit','garden-pond'],upgradeValueDrops:18e6,recordedValueDrops:21e6,recordedShareUnits:7,upgradeShareUnits:6});
     return response({ok:true,property:{...state}});}
    throw Error('Unexpected '+path);};
   const storage={getItem:k=>k==='bcToken'?'t':null};
   const section=mountEstateTycoon(document.getElementById('test-root'),'trailer-01',{fetcher,storage,onConfirmed:()=>confirmed++});
   section.open=true;await section.refresh();
   const A=(ok,m)=>{if(!ok)throw Error(m);};
   const settle=()=>new Promise(r=>setTimeout(r,60));
   const toggle=id=>section.querySelector('[data-cart-toggle="'+id+'"]');
   const bar=()=>section.querySelector('[data-tycoon-cart]');
   A(toggle('flower-garden')&&toggle('fire-pit'),'eligible items have a cart toggle');
   A(!toggle('garden-pond'),'dependant needs its prerequisite in the cart first');
   A(!toggle('estate-helicopter'),'tier-restricted item cannot be carted');
   A(bar().hidden,'empty cart is hidden');
   toggle('flower-garden').click();await settle();
   A(toggle('garden-pond'),'prerequisite in cart enables the dependant');
   A(section.textContent.includes('With Flower garden in cart'),'dependant explains why it is addable');
   toggle('garden-pond').click();await settle();toggle('flower-garden').click();await settle();
   A(!toggle('garden-pond')&&!section.querySelector('[data-in-cart]'),'removing a prerequisite cascades');
   for(const id of ['flower-garden','fire-pit','garden-pond']){toggle(id).click();await settle();}
   A(toggle('fire-pit').getAttribute('aria-pressed')==='true','toggle state is announced');
   A(!bar().hidden&&bar().textContent.includes('3 upgrades · one Xaman payment')&&bar().textContent.includes('18 XRP total, +6 shares'),'cart summary');
   const buyAll=[...bar().querySelectorAll('button')].find(b=>b.textContent==='Buy all · 18 XRP');A(buyAll,'Buy all button');
   window.__cart={calls,validate:v=>{validate=v;},confirmed:()=>confirmed};
   return {calls:calls.length,ok:true};
  });
  if(!out.ok)throw Error('setup failed');
  if(shots){await page.locator('[data-tycoon-cart]').scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/${vp.name}-cart.png`,fullPage:vp.name==='desktop'});}
  await page.locator('[data-tycoon-cart] button.primary').click();await page.waitForTimeout(150);
  const r2=await page.evaluate(()=>({title:document.querySelector('.bc-ty-order h4')?.textContent,link:!!document.querySelector('a.bc-ty-xaman[href^="https://xumm.app/sign/"]')}));
  if(r2.title!=='Approve 3 upgrades in Xaman'||!r2.link)throw Error('sign card '+JSON.stringify(r2));
  if(shots)await page.screenshot({path:`${shots}/${vp.name}-xaman.png`,fullPage:vp.name==='desktop'});
  const r3=await page.evaluate(async()=>{
   const section=document.querySelector('[data-estate-tycoon]');
   const btn=t=>[...section.querySelectorAll('button')].find(b=>b.textContent===t);
   btn('Check payment').click();await new Promise(r=>setTimeout(r,80));
   const pendingOk=section.textContent.includes('No upgrade was credited')&&section.querySelectorAll('.bc-ty-item[data-state=owned]').length===0;
   return {pendingOk};
  });
  if(!r3.pendingOk)throw Error('unvalidated payment must credit nothing');
  const r4=await page.evaluate(async()=>{
   const section=document.querySelector('[data-estate-tycoon]'),c=window.__cart;
   const q=c.calls.find(x=>x.quote),st=c.calls.filter(x=>x.start);
   c.validate(true);
   const btn=t=>[...section.querySelectorAll('button')].find(b=>b.textContent===t);
   btn('Check payment again').click();await new Promise(r=>setTimeout(r,120));
   return {quote:q?.quote,starts:st.length,startBody:st[0]?.start,confirmed:c.confirmed(),
    installed:[...section.querySelectorAll('.bc-ty-item[data-state=owned]')].length,
    glow:section.querySelectorAll('[data-just-installed]').length,
    title:section.querySelector('.bc-ty-order h4')?.textContent,cartHidden:section.querySelector('[data-tycoon-cart]').hidden};
  });
  const sb=r4.startBody||{};
  if(r4.quote!=='flower-garden,fire-pit,garden-pond')throw Error('quote itemIds '+r4.quote);
  if(r4.starts!==1||JSON.stringify(sb.itemIds)!=='["flower-garden","fire-pit","garden-pond"]'||'priceDrops' in sb||'amount' in sb||'itemId' in sb)throw Error('start body '+JSON.stringify(sb));
  if(r4.confirmed!==1||r4.installed!==3||r4.glow!==3||r4.title!=='3 upgrades installed'||!r4.cartHidden)throw Error('settled '+JSON.stringify(r4));
  if(shots){await page.locator('.bc-ty-order').scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/${vp.name}-installed.png`,fullPage:vp.name==='desktop'});}
  await page.close();
  console.log('Estates upgrade cart smoke passed on',vp.name);
 }
}finally{await browser.close();}
