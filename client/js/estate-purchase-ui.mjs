// The server owns price, reservations, signing identity and settlement status.
export function mountEstatePurchase(container,propertyId,{api='https://burn-city-game.fly.dev',fetcher=fetch,storage=localStorage}={}){
 const section=document.createElement('section');section.style.cssText='padding:12px;border:1px solid #ffb45b66;border-radius:10px;margin-top:12px';
 const title=document.createElement('h3');title.textContent='Property purchase';
 const note=document.createElement('p');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 const actions=document.createElement('div');actions.style.cssText='display:grid;gap:8px';section.append(title,note,actions);container.append(section);
 let wallet='signed-in';try{wallet=JSON.parse(atob((storage.getItem('bcToken')||'').split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))).acct||wallet;}catch{}
 const key='bcEstatePurchase:'+propertyId+':'+wallet;let reservationId=storage.getItem(key)||'',busy=false;
 async function request(path,body){const token=storage.getItem('bcToken');if(!token)throw Error('Sign in with Xaman to purchase a property.');
  const response=await fetcher(api+'/api/estates'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok&&response.status!==202)throw Error(data.error||'Request failed.');return data;
 }
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='padding:12px;border-radius:8px;border:1px solid #ffb45b;background:#332014;color:#ffe0b1;font:700 14px system-ui';b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();}catch(e){note.textContent=e.message;}finally{busy=false;if(b.isConnected)b.disabled=false;}};actions.append(b);}
 function link(label,url){try{const parsed=new URL(url);if(parsed.protocol!=='https:')return;const a=document.createElement('a');a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;a.style.cssText='display:block;padding:12px;color:#ffd28c';actions.append(a);}catch{}}
 function receipt(data){actions.replaceChildren();note.textContent='Ownership verified on the XRP Ledger. Your property is now in your portfolio. Hourly distributions are not active yet.';if(data.txHash||data.paymentTx)link('View verified payment','https://livenet.xrpl.org/transactions/'+(data.txHash||data.paymentTx));storage.removeItem(key);preferences();}
 function preferences(){const label=document.createElement('label');label.textContent='Payout currency ';const select=document.createElement('select');select.style.cssText='font-size:16px;padding:8px;background:#17100d;color:#ffe0b1';for(const [value,text] of [['','Choose a currency'],['IMG','IMG'],['XRP','XRP']]){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}label.append(select);actions.append(label);button('Save payout preference',async()=>{if(!select.value)throw Error('Choose IMG or XRP first.');await request('/payout-preference',{currency:select.value});note.textContent='Payout preference saved. Distributions remain disabled until the hourly pipeline is activated.';});void request('/payout-preference').then(p=>{select.value=p.currency||'';}).catch(()=>{});}
 async function check(){const r=await request('/purchase/payment/confirm',{reservationId});if(r.ok){receipt(r);return;}note.textContent=r.pending?'Payment is awaiting ledger validation. Check again shortly.':'Approve the payment in Xaman, then check again.';}
 async function start(){const p=await request('/purchase/payment/start',{reservationId});actions.replaceChildren();note.textContent='Review the XRP amount and treasury destination in Xaman. Ownership is assigned only after ledger verification.';if(p.deeplink)link('Open Xaman to review payment',p.deeplink);button('Check signed payment',check);}
 async function load(){
  if(!storage.getItem('bcToken')){note.textContent='Sign in with Xaman to see the current price and purchase availability.';return;}
  if(reservationId){const state=await request('/purchase/session?reservationId='+encodeURIComponent(reservationId));if(state.ok){if(state.status==='settled'){receipt(state);return;}if(state.status==='expired'){note.textContent='This reservation expired. A signed payment requires review before this property can be sold again.';button('Check expired payment',async()=>{const result=await request('/purchase/payment/review',{reservationId});note.textContent=result.status==='needs_review'?'Payment verified and held for review. No second payment is needed.':result.status;});return;}if(state.status==='reserved'){note.textContent='You have a reserved property. Continue your existing payment; do not create a second one.';button('Continue in Xaman',start);button('Check signed payment',check);return;}}}
  const state=await request('');if(state.owned?.some(p=>p.propertyId===propertyId)){receipt({});return;}
  const quote=await request('/purchase/quote?propertyId='+encodeURIComponent(propertyId));
  if(!quote.ok){note.textContent=quote.error;return;}
  note.textContent=(BigInt(quote.priceDrops)/1000000n).toString()+' XRP · '+quote.shareUnits+' share units. Hourly distributions are not active yet.';
  if(!quote.salesEnabled){note.textContent+=' Purchases are currently paused.';return;}
  button('Reserve and review in Xaman',async()=>{const r=await request('/purchase/reserve',{propertyId});reservationId=r.reservationId;storage.setItem(key,reservationId);await start();});
 }
 void load().catch(e=>{note.textContent=e.message;});return section;
}
