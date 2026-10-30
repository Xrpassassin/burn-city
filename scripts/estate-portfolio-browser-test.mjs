import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
const root=path.resolve('client'),catalog=JSON.parse(fs.readFileSync(path.join(root,'data/estate-catalog.json'))),tiers=new Map(catalog.tiers.map(t=>[t.id,t]));
const calls=[];let paused=false,unavailable=false;
const live=()=>({salesEnabled:!paused,salesStatus:paused?'treasury_paused':'open',distributionsEnabled:!paused,imgXrpProfitDistributionsEnabled:!paused});
function portfolio(wallet){const id=wallet==='wallet-b'?'apartment-01':'trailer-01',property=catalog.properties.find(p=>p.id===id),tier=tiers.get(property.tier),share=tier.shareUnits;
 return {...live(),owned:[{propertyId:id,property,tier,shareUnits:share}],capitalAllocations:[{property_id:id,fundingState:'invested'}],payoutPreference:{currency:'IMG'},xrpProfitCreditDrops:'0',
 portfolio:{properties:[{propertyId:id,imgAllocated24hUnits:'864000000',imgAverageHourlyUnits:'36000000',xrpAllocated24hDrops:'2400000',xrpAverageHourlyDrops:'100000'}],portfolioShareUnits:share,totalShareUnits:6,imgHistoryAvailable:true,xrpHistoryAvailable:true,dataThroughMs:Date.now()-1000,scannerCurrent:true},
 payouts:[{epoch_start_ms:Date.now()-3600000,state:'confirmed',delivered:JSON.stringify('12345'),tx_hash:'A'.repeat(64)}],xrpProfitPayouts:[]};}
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/estates')){
  const wallet=(req.headers.authorization||'').replace('Bearer ','');calls.push({path:u.pathname,wallet,method:req.method});res.setHeader('content-type','application/json');
  if(u.pathname.endsWith('/status')){res.writeHead(unavailable?503:200);res.end(JSON.stringify(unavailable?{error:'unavailable'}:live()));return;}
  if(!['wallet-a','wallet-b'].includes(wallet)){res.writeHead(401);res.end(JSON.stringify({error:'sign_in_with_xaman'}));return;}
  if(u.pathname.endsWith('/portfolio')){res.end(JSON.stringify(portfolio(wallet)));return;}
  if(u.pathname.endsWith('/payout-preference')){res.end(JSON.stringify({currency:'XRP'}));return;}
  res.end('{}');return;
 }
 const file=path.resolve(root,'.'+(u.pathname==='/'?'/estate-properties.html':u.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'text/plain');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:667,height:375}]){
 calls.length=0;paused=false;unavailable=false;
 const page=await browser.newPage({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('bcToken','wallet-a'));await page.goto(url+'/estate-properties.html');
 await page.waitForFunction(()=>window.__estatePortfolio);await page.evaluate(()=>window.__estatePortfolio.ready);
 await page.getByText('Property sales are open.',{exact:true}).waitFor();
 await page.locator('[data-owned-property="trailer-01"]').waitFor();
 assert.equal(await page.locator('#owned-properties').textContent().then(s=>s.includes('36.000000 IMG/h')),true);
 assert.equal(await page.locator('#wallet-history').textContent().then(s=>s.includes('0.012345 XRP')),true,'show actual converted wallet delivery');
 assert.equal(await page.locator('#scenario-net').inputValue(),'0');
 await page.locator('#scenario-net').fill('12');await page.getByText('Hypothetical allocation: 2.000000 IMG',{exact:false}).waitFor();
 await page.locator('#scenario-net').fill('-5');await page.getByText('Hypothetical allocation: 0.000000 IMG',{exact:false}).waitFor();
 await page.locator('#scenario-net').fill('1e3');await page.getByText('Enter an amount with at most six decimal places.',{exact:true}).waitFor();
 assert.equal(calls.some(c=>c.method==='POST'),false,'loading, reporting and scenario inputs never initiate payments');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page fits viewport');
 // Simulate an old wallet request completing after a wallet switch.
 let released;const gate=new Promise(r=>released=r);let intercept=true;
 await page.route('**/api/estates/portfolio',async route=>{if(intercept&&route.request().headers().authorization==='Bearer wallet-a'){intercept=false;await gate;}await route.continue();});
 const pending=page.waitForRequest(r=>r.url().endsWith('/portfolio')&&r.headers().authorization==='Bearer wallet-a');
 await page.getByRole('button',{name:'Refresh wallet portfolio'}).click();await pending;
 await page.evaluate(()=>{localStorage.setItem('bcToken','wallet-b');dispatchEvent(new StorageEvent('storage',{key:'bcToken'}));});
 await page.locator('[data-owned-property="apartment-01"]').waitFor();released();
 await page.waitForResponse(r=>r.url().endsWith('/portfolio')&&r.request().headers().authorization==='Bearer wallet-a');
 assert.equal(await page.locator('[data-owned-property="trailer-01"]').count(),0,'stale wallet response cannot restore private cards');
 assert.equal(await page.locator('#scenario-net').inputValue(),'0','new wallet starts with zero assumptions');
 await page.locator('#scenario-net').fill('12');await page.getByText('Hypothetical allocation: 10.000000 IMG',{exact:false}).waitFor();
 await page.locator('#scenario-asset').selectOption('XRP');await page.locator('#scenario-period').selectOption('day');
 await page.getByText('Hypothetical allocation: 10.000000 XRP for the selected day scenario',{exact:false}).waitFor();
 await page.locator('#payout-currency').selectOption('XRP');await page.getByRole('button',{name:'Save wallet payout preference'}).click();
 await page.getByText('Wallet payout preference saved.',{exact:false}).waitFor();assert.equal(calls.filter(c=>c.method==='POST').length,1);
 assert.equal(calls.find(c=>c.method==='POST').path,'/api/estates/payout-preference');
 paused=true;await page.getByRole('button',{name:'Refresh wallet portfolio'}).click();await page.getByText('Property purchases are temporarily paused.',{exact:true}).waitFor();
 await page.evaluate(()=>{localStorage.removeItem('bcToken');dispatchEvent(new StorageEvent('storage',{key:'bcToken'}));});
 await page.waitForFunction(()=>!document.querySelector('[data-owned-property]'));
 assert.equal(await page.locator('#scenario-net').isDisabled(),true);assert.equal(await page.locator('#wallet-history').textContent(),'');assert.equal(await page.locator('#scenario-property option').count(),0);
 unavailable=true;await page.getByRole('button',{name:'Refresh wallet portfolio'}).click();await page.getByText('Live sales status unavailable. Please refresh.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Xaman bearer token'}).count(),0,'players never paste credentials');
 assert.deepEqual(errors,[]);await page.close();console.log('Owned properties, recorded rates, scenario math, wallet isolation and live status passed',viewport);
}}finally{await browser.close();server.close();}
