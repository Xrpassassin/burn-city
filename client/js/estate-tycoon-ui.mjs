// Optional per-property Roblox-style tycoon shop for Estates.
// Never display a purchase as installed until the server confirms validated XRP.
const xrp=d=>{const n=BigInt(d||0);return (n/1000000n).toString()+(n%1000000n?'.'+(n%1000000n).toString().padStart(6,'0').replace(/0+$/,''):'');};
const humanError={tycoon_purchases_disabled:'XRP upgrades are not enabled yet.',estate_treasury_paused:'The treasury is paused.',property_owner_required:'Only the verified owner may upgrade.',upgrade_prerequisites_missing:'Unlock the prerequisite improvement first.',another_upgrade_pending:'Finish or review your pending upgrade first.',upgrade_already_owned:'This upgrade is already owned.',tycoon_payload_pending:'A payment request is pending. Check again later.',tycoon_order_requires_review:'This payment request requires review; do not pay again.',tycoon_order_not_found:'This order was not found for your wallet.',tycoon_payment_pending:'Your signed payment has not been validated yet.'};
export function mountEstateTycoon(container,propertyId,{api='',fetcher=fetch,storage=localStorage,onConfirmed=()=>{}}={}){
 const section=document.createElement('details');section.dataset.estateTycoon=propertyId;
 section.style.cssText='margin-top:12px;border-top:1px solid #7ca9bf;padding:10px 0;color:#d7e8ed';
 const summary=document.createElement('summary');summary.textContent='BUILD & UPGRADE · Estates Tycoon';summary.style.cssText='cursor:pointer;font-weight:800;color:#6bd4ff';
 const meta=document.createElement('p'),message=document.createElement('p'),catalogue=document.createElement('div');
 message.setAttribute('role','status');message.style.cssText='font-size:12px;color:#ffca9e';
 section.append(summary,meta,message,catalogue);container.append(section);
 let current=null,busy=false,orderId='';
 function token(){return storage?.getItem('bcToken')||'';}
 async function request(path,data){
  const auth=token();
  if(!auth)throw Error('Connect your Xaman wallet to purchase property upgrades.');
  const r=await fetcher(api+'/api/estates/tycoon/'+path,{method:data?'POST':'GET',
   headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const v=await r.json();if(!r.ok&&r.status!==202)throw Error(humanError[v.error]||v.error||'Upgrade request failed.');
  return v;
 }
 function button(label,run,disabled=false){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;
  b.style.cssText='font:600 12px system-ui;background:#20394c;color:#e5f7ff;border:1px solid #5f8ba7;border-radius:8px;padding:8px;min-height:36px;cursor:pointer';
  b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await run();}catch(e){message.textContent=e.message;}finally{busy=false;b.disabled=disabled;}};
  return b;
 }
 function paymentLink(url){
  try{const parsed=new URL(url);if(parsed.protocol!=='https:')throw Error('unsafe_payment_link');
   const a=document.createElement('a');a.href=parsed.href;a.textContent='Review upgrade payment in Xaman';a.target='_blank';a.rel='noopener noreferrer';a.style.color='#ffd19c';message.append(' ',a);
  }catch{message.textContent='Unable to open a secure Xaman link. Contact support before paying.';}
 }
 async function confirm(){
  const r=await request('confirm',{orderId});
  if(!r.ok){message.textContent='Payment not validated yet; nothing has been credited.';return;}
  message.textContent='Validated purchase credited to your property development value and recorded share balance.';
  orderId='';onConfirmed(r.property);await load();
 }
 async function buy(item){
  const q=await request('quote?propertyId='+encodeURIComponent(propertyId)+'&itemId='+encodeURIComponent(item.id));
  if(!q.canPurchase||!q.purchasesEnabled){message.textContent='This upgrade is not currently available for purchase.';return;}
  const r=await request('start',{propertyId,itemId:item.id});
  orderId=r.orderId;message.replaceChildren('Awaiting a validated '+item.priceXrp+' XRP upgrade payment. ');
  paymentLink(r.deeplink);
  message.append(' ',button('Check payment',confirm));
 }
 function render(){
  if(!section.isConnected||!current)return;
  catalogue.replaceChildren();
  const s=current.state,items=current.catalog;
  meta.textContent='Recorded property spend: '+xrp(s.recordedValueDrops)+' XRP · Recorded share balance: '+s.recordedShareUnits+' units ('+s.upgradeShareUnits+' from upgrades). These are ledger totals, not an appraisal or guaranteed payouts.';
  if(!s.ownerAuthorized&&s.owned)message.textContent='Only the property owner can buy upgrades. You can browse the upgrade tree.';
  else if(!s.purchasesEnabled)message.textContent='Build previews available. XRP upgrade purchases remain disabled until treasury and distribution policy review.';
  else message.textContent='';
  if(s.ownerAuthorized&&s.pending?.orderId){
   orderId=s.pending.orderId;
   catalogue.append(button('Check pending payment',confirm));
  }
  const unlocked=new Set(s.unlockedItemIds);
  const groups=[['decor','Decorations'],['exterior','Exterior'],['interior','Interior'],['underground','Secrets & Bunkers'],['utility','Security & Utility']];
  for(const [category,label] of groups){
   const subset=items.filter(i=>i.category===category);if(!subset.length)continue;
   const head=document.createElement('h5');head.textContent=label;head.style.cssText='font-size:12px;color:#a8d4e8;margin:12px 0 6px';catalogue.append(head);
   for(const item of subset){
    const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 0;border-bottom:1px solid #5c7e8b55';
    const labelText=document.createElement('span');labelText.style.cssText='font-size:12px;flex:1';
    const missing=item.requires.filter(id=>!unlocked.has(id)),owned=unlocked.has(item.id);
    labelText.textContent=item.name+' · '+item.priceXrp+' XRP · +'+item.shareUnitsDelta+' share'+(item.shareUnitsDelta===1?'':'s')+
     (owned?' · UNLOCKED':missing.length?' · Needs '+missing.join(', '):'');
    row.append(labelText);
    if(!owned&&s.ownerAuthorized&&s.purchasesEnabled&&!missing.length)row.append(button('Buy',()=>buy(item),!!s.pending));
    else if(owned){const tick=document.createElement('span');tick.textContent='✓';tick.style.color='#73e0aa';row.append(tick);}
    catalogue.append(row);
   }
  }
 }
 async function load(){
  const auth=token();let state,catalog;
  if(auth){const r=await request('state?propertyId='+encodeURIComponent(propertyId));state=r;catalog=r.items;}
  else{
   const r=await fetcher(api+'/api/estates/tycoon/world',{cache:'no-store'});
   if(!r.ok)throw Error('Upgrade catalogue is unavailable.');
   const v=await r.json(),s=v.properties?.find(p=>p.propertyId===propertyId);
   if(!s)throw Error('Property could not be found.');
   state={...s,upgradeShareUnits:Math.max(0,s.recordedShareUnits-(s.recordedValueDrops-s.upgradeValueDrops)/3000000),
    ownerAuthorized:false,purchasesEnabled:false};catalog=v.catalog;
  }
  // The unauthenticated public state intentionally exposes only aggregate
  // development value; base shares are calculated using the authoritative catalog.
  current={state,catalog};render();
 }
 section.refresh=()=>load().catch(e=>{if(section.isConnected)message.textContent=e.message;});
 void section.refresh();return section;
}
