import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';
const source=fs.readFileSync(new URL('../client/js/estate-purchase-ui.mjs',import.meta.url));
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/ui.mjs'?'text/javascript':'text/html');res.end(req.url==='/ui.mjs'?source:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#17100d;color:#ffe0b1;font:14px system-ui;margin:16px"><main></main>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{
  const {mountEstatePurchase}=await import('/ui.mjs');
  localStorage.clear();localStorage.setItem('bcToken',btoa(JSON.stringify({acct:'test-wallet'}))+'.test');
  window.calls=[];let confirmed=0;
  window.mount=(enabled=true)=>mountEstatePurchase(document.querySelector('main'),'trailer-01',{fetcher:async(url,options)=>{
   const path=new URL(url).pathname.replace('/api/estates','');window.calls.push({path,body:options.body?JSON.parse(options.body):null});
   let data={};
   if(path==='')data={owned:[]};
   if(path==='/purchase/quote')data={ok:true,priceDrops:3000000,shareUnits:1,salesEnabled:enabled};
   if(path==='/purchase/reserve')data={ok:true,reservationId:'test-reservation'};
   if(path==='/purchase/payment/start')data={ok:true,deeplink:'https://example.com/sign'};
   if(path==='/purchase/payment/confirm')data=++confirmed===1?{ok:false,pending:true}:{ok:true,txHash:'A'.repeat(64)};
   if(path==='/payout-preference')data={currency:options.body?JSON.parse(options.body).currency:null};
   return {ok:true,status:200,json:async()=>data};
  }});
  window.mount(false);
 });
 await page.getByText('Purchases are currently paused.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button').count(),0);
 await page.evaluate(()=>{document.querySelector('main').replaceChildren();window.mount(true);});
 await page.getByRole('button',{name:'Reserve and review in Xaman'}).click();
 assert.equal(await page.getByRole('link',{name:'Open Xaman to review payment'}).getAttribute('href'),'https://example.com/sign');
 await page.getByRole('button',{name:'Check signed payment'}).click();
 await page.getByText('Payment is awaiting ledger validation.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Check signed payment'}).click();
 await page.getByText('Ownership verified on the XRP Ledger.',{exact:false}).waitFor();
 await page.getByLabel('Payout currency').selectOption('XRP');
 await page.getByRole('button',{name:'Save payout preference'}).click();
 await page.getByText('Payout preference saved.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls.find(c=>c.path==='/purchase/reserve').body,{propertyId:'trailer-01'});
 assert.deepEqual(calls.filter(c=>c.path==='/payout-preference'&&c.body).at(-1).body,{currency:'XRP'});
 fs.mkdirSync('estate-purchase-preview',{recursive:true});await page.screenshot({path:'estate-purchase-preview/mobile-settled.png',fullPage:true});
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'estate-purchase-preview/desktop-settled.png',fullPage:true});
 console.log('Mobile/desktop purchase component: paused, reserve, signing, pending, confirmed and preference passed');
}finally{await browser.close();server.close();}
