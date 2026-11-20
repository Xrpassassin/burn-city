// Read-only browser smoke: Estates > Owned properties can open the upgrade shop in place
// (no travel), using the same tycoon purchase flow. All API responses are local fixtures.
import {createRequire} from 'node:module';
const require=createRequire((process.env.PLAYWRIGHT_DIR||process.cwd())+'/node_modules/');
const {chromium}=require('playwright');
const base=(process.argv[2]||'http://127.0.0.1:8080').replace(/\/$/,'');
const shots=process.env.SHOTS_DIR||'';
const UUID='1289e9ae-7d5d-4d5f-b89c-18633112ce09';
const items=[
 {id:'porch-lights',name:'Porch & path lights',category:'decor',priceXrp:3,shareUnitsDelta:1,requires:[],eligibleTiers:[]},
 {id:'flower-garden',name:'Flower garden',category:'decor',priceXrp:3,shareUnitsDelta:1,requires:[],eligibleTiers:[]},
 {id:'fire-pit',name:'Backyard fire pit',category:'decor',priceXrp:6,shareUnitsDelta:2,requires:[],eligibleTiers:[]}];
const browser=await chromium.launch();
const fail=m=>{throw Error(m)};
try{
 for(const [name,vp] of [['phone',{width:390,height:844,mobile:true}],['desktop',{width:1280,height:900,mobile:false}]]){
  const ctx=await browser.newContext({viewport:{width:vp.width,height:vp.height},isMobile:vp.mobile,hasTouch:vp.mobile,serviceWorkers:'block'});
  await ctx.addInitScript(()=>{localStorage.setItem('bcToken','test-token');localStorage.setItem('bcAcct','rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV');});
  const page=await ctx.newPage();page.on('pageerror',e=>console.warn('pageerror',e.message.slice(0,200)));const calls=[];let unlocked=['flower-garden'],validated=false;
  const state=()=>({propertyId:'trailer-01',tier:'trailer',owned:true,baseValueDrops:3000000,upgradeValueDrops:unlocked.length*3000000,recordedValueDrops:3000000+unlocked.length*3000000,
   recordedShareUnits:1+unlocked.length,upgradeShareUnits:unlocked.length,unlockedItemIds:[...unlocked],ownerAuthorized:true,purchasesEnabled:true,purchaseStatus:'available',
   items:items.map(i=>({...i,unlocked:unlocked.includes(i.id),tierEligible:true,prerequisitesMet:true})),pending:null});
  await page.route('**/api/estates/**',route=>{
   const u=new URL(route.request().url()),p=u.pathname;calls.push(p);
   const json=(v,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(v)});
   if(p.endsWith('/tycoon/state'))return json(state());
   if(p.endsWith('/tycoon/quote'))return json({ok:true,canPurchase:true,purchasesEnabled:true,purchaseStatus:'available'});
   if(p.endsWith('/tycoon/start'))return json({ok:true,orderId:'tycoon_'+'a'.repeat(40),deeplink:'https://xumm.app/sign/'+UUID,qr:'https://xumm.app/sign/'+UUID+'_q.png'});
   if(p.endsWith('/tycoon/confirm')){if(!validated)return json({ok:false,pending:true,error:'tycoon_payment_pending'},202);unlocked=[...unlocked,'porch-lights'];return json({ok:true,property:state()});}
   if(p.endsWith('/portfolio'))return json({owned:[{propertyId:'trailer-01',shareUnits:1,property:{address:'12 Ember Lane',tier:'trailer'},tier:{label:'Trailer'}}],
    portfolio:{properties:[],portfolioShareUnits:1,totalShareUnits:27,imgHistoryAvailable:false,xrpHistoryAvailable:false},
    tycoon:{properties:[state()],recordedShareUnits:2,upgradeShareUnits:1,recordedValueDrops:6000000},payouts:[],xrpProfitPayouts:[]});
   if(p.endsWith('/ownership'))return json({properties:[{propertyId:'trailer-01',owner:'rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV'}]});
   return json({ok:true,salesEnabled:true});
  });
  await page.route('https://xumm.app/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'}));
  await page.goto(base+'/estate-properties.html#owned',{waitUntil:'domcontentloaded'});
  const card=page.locator('[data-owned-property="trailer-01"]');await card.waitFor({state:'attached',timeout:20000}).catch(async e=>{console.warn(await page.locator('#owned-properties').textContent(),calls);throw e;});
  await page.locator('[data-view="mine"]').click().catch(()=>{});await card.waitFor({timeout:10000});
  const installed=await card.locator('[data-installed-upgrades]').textContent();
  if(!/Installed upgrades: Flower garden/.test(installed))fail(name+': installed upgrades not shown: '+installed);
  const startUrl=page.url();
  await card.locator('[data-owned-upgrade]').click();
  const shop=card.locator('[data-estate-tycoon="trailer-01"]');await shop.waitFor();
  await page.waitForTimeout(300);
  if(!await shop.evaluate(d=>d.open))fail(name+': upgrade shop not expanded');
  if(shots){await card.scrollIntoViewIfNeeded();await page.screenshot({path:shots+'/'+name+'-owned-upgrade-shop.png',fullPage:false});}
  await shop.getByRole('button',{name:/Buy Porch/}).click();
  await shop.locator('a.bc-ty-xaman').waitFor();
  if(await shop.locator('a.bc-ty-xaman').getAttribute('href')!=='https://xumm.app/sign/'+UUID)fail(name+': wrong Xaman link');
  if(calls.filter(c=>c.endsWith('/tycoon/start')).length!==1)fail(name+': start not called exactly once');
  if(page.url()!==startUrl)fail(name+': page navigated away (travel) during upgrade');
  if(shots)await page.screenshot({path:shots+'/'+name+'-owned-upgrade-xaman.png'});
  await shop.getByRole('button',{name:'Check payment'}).click();await page.waitForTimeout(200);
  if(!(await shop.textContent()).includes('No upgrade was credited'))fail(name+': unvalidated payment not explained');
  if((await card.locator('[data-installed-upgrades]').textContent()).includes('Porch'))fail(name+': credited before validation');
  validated=true;
  await shop.getByRole('button',{name:'Check payment again'}).click();
  await page.waitForFunction(()=>document.querySelector('[data-installed-upgrades="trailer-01"]')?.textContent.includes('Porch & path lights'));
  if(shots)await page.screenshot({path:shots+'/'+name+'-owned-upgrade-installed.png'});
  console.log('PASS',name,'Owned properties: in-place upgrade shop, Xaman request, validated-only install');
  await ctx.close();
 }
}finally{await browser.close();}
