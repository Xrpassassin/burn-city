// Optional per-property Roblox-style tycoon shop for Estates.
// Never display a purchase as installed until the server confirms validated XRP.
const xrp=d=>{const n=BigInt(d||0);return (n/1000000n).toString()+(n%1000000n?'.'+(n%1000000n).toString().padStart(6,'0').replace(/0+$/,''):'');};
const humanError={sign_in_with_xaman:'Your wallet session expired. Sign in with Xaman again to manage your property.',slow_down:'Too many upgrade requests. Please retry shortly.',tycoon_purchases_disabled:'XRP upgrades are not enabled yet.',estate_treasury_paused:'The treasury is paused.',property_owner_required:'Only the verified owner may upgrade.',upgrade_prerequisites_missing:'Unlock the prerequisite improvement first.',upgrade_tier_restricted:'Helicopters are available only for Family Homes and Luxury Mansions.',another_upgrade_pending:'Finish or review your pending upgrade first.',upgrade_already_owned:'This upgrade is already owned.',tycoon_payload_pending:'Xaman has not issued this payment request yet. Nothing was charged. If it never opened, it clears by itself about 15 minutes after you tapped Buy.',tycoon_order_requires_review:'Xaman could not create this payment request, so nothing can be paid or charged. It clears by itself about 15 minutes after you tapped Buy; then you can buy again.',tycoon_order_not_found:'This order was not found for your wallet.',tycoon_payment_pending:'Your signed payment has not been validated yet.',tycoon_order_expired:'That payment request expired unpaid, so it was released. You can start a new one.'};
// Shared look for the shop (injected once; scoped with :is(#id,body) so it wins
// over the in-world panel's generic `#bcEstatesLivePrompt button/p` rules).
const S=':is(#bcEstatesLivePrompt,body) .bc-tycoon';
const STYLE=`
${S}{margin-top:12px;border-top:1px solid var(--bc-border-strong,#ffad6c6e);padding:10px 0 2px;color:var(--bc-text,#f7f4f0);font:500 13px/1.45 var(--bc-font-ui,system-ui,sans-serif)}
${S}>summary{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;list-style:none;font:800 14px/1.2 var(--bc-font-display,system-ui,sans-serif);letter-spacing:.04em;color:#ffd49a}
${S}>summary::-webkit-details-marker{display:none}
${S}>summary::before{content:'▸';color:var(--bc-ember,#ff8b39);transition:transform var(--bc-motion-fast,160ms)}
${S}[open]>summary::before{transform:rotate(90deg)}
${S} .bc-ty-count{margin-left:auto;font:700 11px var(--bc-font-data,monospace);color:var(--bc-text-muted,#c4cbd0);background:#ffffff10;border-radius:99px;padding:3px 8px}
${S} p{margin:0 0 10px}
${S} .bc-ty-banner{display:flex;gap:8px;align-items:flex-start;margin:4px 0 10px;padding:9px 11px;border-radius:10px;font-size:12.5px;border:1px solid;background:#ffffff08}
${S} .bc-ty-banner::before{content:'●';font-size:10px;line-height:1.9}
${S} .bc-ty-banner[data-tone=ok]{border-color:#7dffd255;color:#c9fff0}${S} .bc-ty-banner[data-tone=ok]::before{color:var(--bc-success,#7dffd2)}
${S} .bc-ty-banner[data-tone=warn]{border-color:#ffc06a66;color:#ffe2b8}${S} .bc-ty-banner[data-tone=warn]::before{color:#ffc06a}
${S} .bc-ty-banner[data-tone=off]{border-color:#ffffff26;color:var(--bc-text-muted,#c4cbd0)}
${S} .bc-ty-msg:empty{display:none}
${S} .bc-ty-msg{font-size:12.5px;color:#ffd9b8;padding:8px 10px;border-radius:9px;background:#ff8b3914}
${S} .bc-ty-order{margin:0 0 12px;padding:12px;border-radius:12px;border:1px solid var(--bc-border-strong,#ffad6c6e);background:linear-gradient(145deg,#2a1a10e6,#141a22e6)}
${S} .bc-ty-order[data-phase=settled]{border-color:#7dffd277;background:linear-gradient(145deg,#0f2a22e6,#141a22e6)}
${S} .bc-ty-order[data-phase=expired],${S} .bc-ty-order[data-phase=review]{border-color:#ff9b8a77}
${S} .bc-ty-order h4{margin:0 0 8px;font:800 14px/1.3 var(--bc-font-display,system-ui,sans-serif);color:var(--bc-text,#fff)}
${S} .bc-ty-order p{font-size:12.5px;color:#e6dcd2}
${S} .bc-ty-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 10px;padding:0;list-style:none;counter-reset:s}
${S} .bc-ty-steps li{counter-increment:s;font:700 11px/1.25 var(--bc-font-ui,system-ui);color:#9aa4ab;padding-top:8px;border-top:3px solid #ffffff22}
${S} .bc-ty-steps li::before{content:counter(s) '. '}
${S} .bc-ty-steps li[data-s=done]{color:var(--bc-success,#7dffd2);border-color:var(--bc-success,#7dffd2)}
${S} .bc-ty-steps li[data-s=done]::before{content:'✓ '}
${S} .bc-ty-steps li[data-s=active]{color:#ffd49a;border-color:var(--bc-ember,#ff8b39)}
${S} .bc-ty-steps li[data-s=stop]{color:#ffb4a6;border-color:#ff8a75}
${S} .bc-ty-actions{display:flex;flex-wrap:wrap;gap:8px}
${S} button,${S} .bc-ty-xaman{box-sizing:border-box;min-height:var(--bc-touch-target,44px);padding:8px 14px;border-radius:10px;border:1px solid #ffb45b80;background:#2a1d14;color:#fff1df;font:700 13px/1.2 var(--bc-font-ui,system-ui);cursor:pointer;touch-action:manipulation}
${S} button.primary,${S} .bc-ty-xaman{background:linear-gradient(135deg,#ff7b27,#ffc078);color:#241508;border-color:#ffe0b4}
${S} .bc-ty-xaman{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
${S} .bc-ty-qr{display:block;width:168px;height:168px;margin:0 0 10px;border-radius:10px;background:#fff;padding:6px;box-sizing:content-box}
${S} .bc-ty-alt{align-self:center;font-size:12px;color:#ffd49a}
${S} button:disabled{opacity:.45;cursor:not-allowed}
${S} button:focus-visible,${S} .bc-ty-xaman:focus-visible,${S}>summary:focus-visible{outline:2px solid var(--bc-focus,#7ce2ff);outline-offset:2px}
${S} h5{margin:14px 0 4px;font:800 11px/1.2 var(--bc-font-ui,system-ui);letter-spacing:.12em;text-transform:uppercase;color:#ffb877}
${S} .bc-ty-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #ffffff14}
${S} .bc-ty-item strong{display:block;font-size:13.5px;font-weight:700;color:var(--bc-text,#fff)}
${S} .bc-ty-chips{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:2px;font-size:11.5px;color:var(--bc-text-muted,#c4cbd0)}
${S} .bc-ty-price{font-family:var(--bc-font-data,monospace);font-weight:700;color:#ffd49a}
${S} .bc-ty-badge{font-weight:700;color:#ffc9a3}
${S} .bc-ty-item[data-state=owned] .bc-ty-badge{color:var(--bc-success,#7dffd2)}
${S} .bc-ty-item[data-state=locked] strong{color:#cfd5da}
${S} .bc-ty-item button{padding:8px 11px;font-size:12.5px}
${S} .bc-ty-item[data-just-installed]{animation:bcTyGlow 2.4s ease-out}
@keyframes bcTyGlow{from{background:#7dffd233}to{background:transparent}}
${S} .bc-ty-acts{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}
${S} .bc-ty-item button[aria-pressed=true]{background:#123a2e;border-color:var(--bc-success,#7dffd2);color:#c9fff0}
${S} .bc-ty-item[data-in-cart]{background:linear-gradient(90deg,#7dffd212,transparent)}
${S} .bc-ty-cart{position:sticky;bottom:0;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 4px;padding:10px 12px;border-radius:12px;border:1px solid #7dffd266;background:linear-gradient(145deg,#0f2a22f2,#141a22f2);box-shadow:0 -6px 18px #0008}
${S} .bc-ty-cart[hidden]{display:none}
${S} .bc-ty-cart-sum{flex:1 1 160px;min-width:0;font-size:12.5px;color:#c9fff0}
${S} .bc-ty-cart-sum b{display:block;font:800 13.5px/1.3 var(--bc-font-ui,system-ui);color:#fff}
${S} .bc-ty-foot{margin:12px 0 0;font-size:11px;line-height:1.45;color:#9aa4ab}
@media(max-width:380px){${S} .bc-ty-item{grid-template-columns:1fr}${S} .bc-ty-acts{justify-content:flex-start}}
@media(prefers-reduced-motion:reduce){${S} .bc-ty-item[data-just-installed]{animation:none}${S}>summary::before{transition:none}}
`;
function injectStyle(){
 const doc=globalThis.document;
 if(!doc?.head||typeof doc.getElementById!=='function'||doc.getElementById('bc-tycoon-style'))return;
 const st=doc.createElement('style');st.id='bc-tycoon-style';st.textContent=STYLE;doc.head.append(st);
}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
export function mountEstateTycoon(container,propertyId,{api='',fetcher=fetch,storage=localStorage,onConfirmed=()=>{},onPreview=null}={}){
 injectStyle();
 const section=el('details','bc-tycoon');section.dataset.estateTycoon=propertyId;
 const summary=el('summary',null,'Build & upgrade'),count=el('span','bc-ty-count','');summary.append(count);
 const availability=el('p','bc-ty-banner'),message=el('p','bc-ty-msg'),order=el('div','bc-ty-order'),catalogue=el('div'),meta=el('p','bc-ty-foot');
 const cartBar=el('div','bc-ty-cart');cartBar.dataset.tycoonCart='';cartBar.hidden=true;cartBar.setAttribute('aria-live','polite');
 availability.dataset.tycoonAvailability='';availability.setAttribute('role','status');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 order.setAttribute('aria-live','polite');order.hidden=true;
 section.append(summary,availability,message,order,catalogue,cartBar,meta);container.append(section);
 let current=null,busy=false,orderId='',orderLink='',orderItemId='',justInstalled='',previewItemId=null;
 // Multi-upgrade cart: ids chosen for ONE payment. The server prices it; this is only a selection.
 const cartIds=new Set();
 const keyIds=key=>String(key||'').startsWith('cart:')?String(key).slice(5).split('+'):key?[String(key)]:[];
 function token(){return storage?.getItem('bcToken')||'';}
 const itemName=id=>String(id||'').startsWith('cart:')?keyIds(id).length+' upgrades':current?.catalog?.find(i=>i.id===id)?.name||'Upgrade';
 async function request(path,data,{allowConflict=false}={}){
  const auth=token();
  if(!auth)throw Error('Connect your Xaman wallet to purchase property upgrades.');
  const r=await fetcher(api+'/api/estates/tycoon/'+path,{method:data?'POST':'GET',
   headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const v=await r.json();if(!r.ok&&r.status!==202&&!(allowConflict&&r.status===409&&v?.error))throw Error(humanError[v.error]||v.error||'Upgrade request failed.');
  return v;
 }
 function button(label,run,disabled=false,{primary=false,aria=''}={}){
  const b=el('button',primary?'primary':null,label);b.type='button';b.disabled=disabled;
  if(aria)b.setAttribute('aria-label',aria);
  b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;const was=b.textContent;b.setAttribute('aria-busy','true');
   try{await run();}catch(e){message.textContent=e.message;}finally{busy=false;b.disabled=disabled;b.setAttribute('aria-busy','false');if(b.textContent!==was)b.textContent=was;}};
  return b;
 }
 function safeXaman(url){try{const u=new URL(url);return u.protocol==='https:'&&['xumm.app','xaman.app'].includes(u.hostname)?u:null;}catch{return null;}}
 const touch=()=>{try{return !!globalThis.matchMedia?.('(pointer:coarse)').matches;}catch{return false;}};
 // Open a tab synchronously inside the tap (before any await) so mobile browsers don't
 // block it as a popup; it is pointed at Xaman once the server returns the request.
 function preopen(){if(!touch())return null;try{return globalThis.open?.('about:blank','_blank')||null;}catch{return null;}}
 function xamanLink(url){
  try{const parsed=safeXaman(url);if(!parsed)throw Error('unsafe_payment_link');
   const a=el('a','bc-ty-xaman','Open in Xaman');a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';
   a.setAttribute('aria-label','Review upgrade payment in Xaman');return a;
  }catch{return el('span',null,'Unable to open a secure Xaman link. Contact support before paying.');}
 }
 // One card describes the whole purchase: 1 approve in Xaman → 2 ledger check → 3 installed.
 const STEPS=['Approve in Xaman','Ledger check','Installed'];
 const PHASES={
  sign:{title:n=>'Approve '+n+' in Xaman',steps:['active','','']},
  checking:{title:()=>'Waiting for the XRP Ledger',steps:['done','active','']},
  settled:{title:n=>n+' installed',steps:['done','done','done']},
  expired:{title:()=>'Payment request expired',steps:['stop','','']},
  review:{title:()=>'Payment needs review',steps:['','stop','']}
 };
 function showOrder(phase,text,actions=[],extra=null,{reveal=true}={}){
  const p=PHASES[phase];order.hidden=false;order.dataset.phase=phase;section.open=true;
  const steps=el('ol','bc-ty-steps');steps.setAttribute('aria-label','Upgrade purchase progress');
  STEPS.forEach((label,i)=>{const li=el('li',null,label);if(p.steps[i])li.dataset.s=p.steps[i];if(p.steps[i]==='active')li.setAttribute('aria-current','step');steps.append(li);});
  const row=el('div','bc-ty-actions');row.append(...actions);
  order.replaceChildren(el('h4',null,p.title(itemName(orderItemId))),steps,el('p',null,text),...(extra?[extra]:[]),row);
  if(reveal)revealOrder();
 }
 function hideOrder(){order.hidden=true;order.replaceChildren();delete order.dataset.phase;}
 function revealOrder(){
  section.open=true;
  try{order.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});}catch{}
 }
 async function confirm(){
  if(!orderId){message.textContent='No pending upgrade payment was found. Refresh the property before trying again.';return;}
  message.textContent='';
  const r=await request('confirm',{orderId});
  if(!r.ok){
   showOrder('checking',(humanError[r.error]||'Payment has not yet been validated.')+' No upgrade was credited; do not send another payment. Ledger checks usually finish within a minute.',
    [...(orderLink?[xamanLink(orderLink)]:[]),button('Check payment again',confirm,false,{primary:!orderLink})]);
   return;
  }
  justInstalled=orderItemId;orderId='';orderLink='';previewItemId=null;onPreview?.(null);
  for(const id of keyIds(orderItemId))cartIds.delete(id);onConfirmed(r.property);
  await load();
  showOrder('settled',keyIds(orderItemId).length>1?'One validated XRP Ledger payment installed all '+keyIds(orderItemId).length+' upgrades. Look for them around your home.':'Validated on the XRP Ledger and added to your property. Look for it outside your home.');
 }
 function showPendingLink(result,win=null){
  const link=result?.ok&&result?.orderId?safeXaman(result.deeplink):null;
  if(!link){
   try{win?.close();}catch{}
   if(result?.orderId)orderId=result.orderId;
   showOrder('review',(humanError[result?.error]||'This payment request could not be opened.')+' Do not send XRP manually.',
    [button('Check payment',confirm)]);
   return;
  }
  orderId=result.orderId;orderLink=link.href;
  let opened=false;
  if(win){try{win.location.href=orderLink;opened=true;}catch{try{win.close();}catch{}}}
  const qr=safeXaman(result.qr);
  const actions=[xamanLink(orderLink),button('Check payment',confirm)];
  const uuid=/\/sign\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(orderLink)?.[1];
  if(uuid&&touch()){const a=el('a','bc-ty-alt','Xaman app didn\'t open? Try here');a.href='xumm://xumm.app/sign/'+uuid.toLowerCase();actions.push(a);}
  let img=null;
  if(qr&&!touch()){img=el('img','bc-ty-qr');img.src=qr.href;img.alt='Xaman payment QR code';img.width=168;img.height=168;}
  showOrder('sign',(opened?'Xaman opened in a new tab. ':touch()?'Tap Open in Xaman to review the payment. ':'Scan the QR code with Xaman, or open the request. ')+
   'Only the server-verified XRP amount is payable. After you sign, come back and tap Check payment.',actions,img);
 }
 async function resumePending(){
  const pending=current?.state?.pending;
  if(!pending||!current.state.purchasesEnabled||Date.now()>=pending.expiresAt){
   message.textContent='This request cannot be reopened. Check the existing payment before contacting support; do not pay again.';
   return;
  }
  orderItemId=pending.itemId;const win=preopen();
  try{showPendingLink(await request('start',{propertyId,itemId:pending.itemId},{allowConflict:true}),win);}catch(e){try{win?.close();}catch{}throw e;}
 }
 async function buy(item){
  const win=preopen();
  try{await buyWith(item,win);}catch(e){try{win?.close();}catch{}throw e;}
 }
 async function buyWith(item,win){
  const q=await request('quote?propertyId='+encodeURIComponent(propertyId)+'&itemId='+encodeURIComponent(item.id));
  if(!q.canPurchase||!q.purchasesEnabled){
   try{win?.close();}catch{}
   message.textContent=q.pending?'An existing upgrade order is blocking another purchase. Check that payment first.':'This upgrade is not payable. Check the owner, prerequisites, and payment availability above.';
   await load();return;
  }
  orderItemId=item.id;justInstalled='';
  showPendingLink(await request('start',{propertyId,itemId:item.id},{allowConflict:true}),win);
 }
 function cartItems(){const items=current?.catalog||[];return items.filter(i=>cartIds.has(i.id));}
 // Removing a prerequisite also removes cart items that depended on it.
 function pruneCart(){
  const items=current?.catalog||[],s=current?.state||{},unlocked=new Set(s.unlockedItemIds||[]);
  let changed=true;
  while(changed){changed=false;
   for(const id of [...cartIds]){const i=items.find(x=>x.id===id);
    const ok=i&&!unlocked.has(id)&&(!i.eligibleTiers?.length||i.eligibleTiers.includes(s.tier))&&i.requires.every(r=>unlocked.has(r)||cartIds.has(r));
    if(!ok){cartIds.delete(id);changed=true;}}
  }
 }
 function toggleCart(item){if(cartIds.has(item.id))cartIds.delete(item.id);else cartIds.add(item.id);pruneCart();render();}
 async function buyCart(){
  const ids=cartItems().map(i=>i.id);if(!ids.length)return;
  if(ids.length===1)return buy(cartItems()[0]);
  const win=preopen();
  try{
   const q=await request('quote',{propertyId,itemIds:ids});
   if(!q.canPurchase||!q.purchasesEnabled){
    try{win?.close();}catch{}
    message.textContent=q.pending?'An existing upgrade order is blocking another purchase. Check that payment first.'
     :q.missingPrerequisites?.length?'Add '+q.missingPrerequisites.map(itemName).join(', ')+' to the cart first.':'This cart is not payable. Check the owner, prerequisites, and payment availability above.';
    await load();return;
   }
   orderItemId=q.itemId;justInstalled='';
   showPendingLink(await request('start',{propertyId,itemIds:ids},{allowConflict:true}),win);
  }catch(e){try{win?.close();}catch{}throw e;}
 }
 function renderCart(s){
  pruneCart();
  const list=cartItems(),canBuy=!!(s.ownerAuthorized&&s.purchasesEnabled);
  if(!list.length||!canBuy){cartBar.hidden=true;cartBar.replaceChildren();return;}
  const totalXrp=list.reduce((n,i)=>n+i.priceXrp,0),shares=list.reduce((n,i)=>n+i.shareUnitsDelta,0);
  const sum=el('div','bc-ty-cart-sum');
  sum.append(el('b',null,list.length===1?'1 upgrade selected':list.length+' upgrades · one Xaman payment'),
   el('span',null,list.map(i=>i.name).join(' · ')+' — '+totalXrp+' XRP total, +'+shares+' share'+(shares===1?'':'s')));
  cartBar.hidden=false;
  cartBar.replaceChildren(sum,
   button('Clear',()=>{cartIds.clear();render();},false,{aria:'Clear the upgrade cart'}),
   button(list.length===1?'Buy · '+totalXrp+' XRP':'Buy all · '+totalXrp+' XRP',buyCart,!!s.pending,{primary:true,aria:'Buy '+list.length+' upgrade'+(list.length===1?'':'s')+' for '+totalXrp+' XRP in one payment'}));
 }
 function render(){
  if(!section.isConnected||!current)return;
  catalogue.replaceChildren();
  const s=current.state,items=current.catalog;
  const unlocked=new Set(s.unlockedItemIds);
  count.textContent=items.filter(i=>unlocked.has(i.id)).length+'/'+items.length+' installed';
  meta.textContent=(s.owned?'Recorded property spending: ':'Preview starting price: ')+xrp(s.recordedValueDrops)+' XRP · '+(s.owned?'Recorded share balance: ':'Potential starting share units: ')+s.recordedShareUnits+' units ('+s.upgradeShareUnits+' from verified upgrades). '+(s.owned?(s.sharePolicy==='active_for_distributions'?'Upgrade shares count toward hourly payout weight, like property shares (1 share per 3 XRP). ':'Upgrade units are not counted in payout weight while upgrade payouts are switched off. '):'Buy the property before unlocking improvements. ')+'This is not a market appraisal or a guaranteed payout.';
  const isOwner=!!s.ownerAuthorized;
  availability.dataset.tone=!s.owned||!isOwner?'off':!s.purchasesEnabled?'warn':'ok';
  availability.textContent=!s.owned?'This property must be purchased before upgrades can be bought.'
   :!isOwner?'Only the wallet that owns this property can purchase upgrades. Sign in with that wallet.'
   :!s.purchasesEnabled?(s.purchaseStatus==='treasury_paused'
     ?'XRP upgrade purchases are temporarily paused by the server. No new payments can be started.'
     :'XRP upgrade purchases have not been activated on this server. Preview only; do not send XRP.')
   :'XRP upgrade payments are available. Review each exact price in Xaman; an upgrade appears only after validated settlement.';
  if(previewItemId)message.textContent='CYAN 3D PREVIEW ONLY · '+(items.find(i=>i.id===previewItemId)?.name||'Selected upgrade')+
   ' · not purchased, not installed, and no recorded shares or financial rights have changed.';
  else if(message.textContent.startsWith('CYAN 3D PREVIEW ONLY'))message.textContent='';
  if(s.ownerAuthorized&&s.pending?.orderId){
   if(orderId!==s.pending.orderId)orderLink='';
   orderId=s.pending.orderId;orderItemId=s.pending.itemId;
   const expired=Date.now()>=Number(s.pending.expiresAt);
   const actions=[...(orderLink&&!expired?[xamanLink(orderLink)]:[]) ,button('Check existing payment',confirm,false,{primary:expired})];
   if(s.purchasesEnabled&&!expired&&!orderLink)actions.push(button('Continue existing Xaman request',resumePending,false,{primary:true}));
   const qr=(!expired&&orderLink&&!touch())?safeXaman((()=>{try{const u=new URL(orderLink);return u.origin+u.pathname+'_q.png';}catch{return '';}})()):null;
   let extra=null;
   if(qr){extra=el('img','bc-ty-qr');extra.src=qr.href;extra.alt='Xaman payment QR code';extra.width=168;extra.height=168;}
   showOrder(expired?'expired':'sign',expired
    ?'The signing window for this request has closed. If you never signed it, it is released automatically (about 15 minutes after it was created) and you can buy again. If you did sign, check the existing payment. Do not send a duplicate payment.'
    : (orderLink?'Approve this payment in Xaman. Only the server-verified XRP amount is payable. After you sign, come back and tap Check payment.'
      :'This order is still open. Finish or review it before buying another upgrade. Do not send a duplicate payment.'),actions,extra,{reveal:false});
   order.dataset.tycoonPending='';
  }else{
   delete order.dataset.tycoonPending;
   if(order.dataset.phase==='expired'||(order.dataset.phase==='sign'&&!orderLink))hideOrder();
  }
  const groups=[['decor','Decorations'],['exterior','Exterior'],['interior','Interior'],['underground','Secrets & Bunkers'],['utility','Security & Utility'],['aviation','Private Aviation']];
  for(const [category,label] of groups){
   const subset=items.filter(i=>i.category===category);if(!subset.length)continue;
   catalogue.append(el('h5',null,label));
   for(const item of subset){
    const missing=item.requires.filter(id=>!unlocked.has(id)),owned=unlocked.has(item.id);
    const tierEligible=!item.eligibleTiers?.length||item.eligibleTiers.includes(s.tier);
    const row=el('div','bc-ty-item');row.dataset.state=owned?'owned':(!tierEligible||missing.length)?'locked':'available';
    if(owned&&keyIds(justInstalled).includes(item.id))row.dataset.justInstalled='';
    if(cartIds.has(item.id))row.dataset.inCart='';
    const acts=el('div','bc-ty-acts');
    const info=el('div'),chips=el('div','bc-ty-chips');
    chips.append(el('span','bc-ty-price',item.priceXrp+' XRP'),el('span',null,'+'+item.shareUnitsDelta+(s.sharePolicy==='active_for_distributions'?' payout share':' recorded share')+(item.shareUnitsDelta===1?'':'s')));
    const viaCart=missing.length&&missing.every(id=>cartIds.has(id));
    const badge=owned?'✓ Installed':!tierEligible?'Family / Mansion only':viaCart?'With '+missing.map(itemName).join(', ')+' in cart':missing.length?'Needs '+missing.map(itemName).join(', '):'';
    if(badge)chips.append(el('span','bc-ty-badge',badge));
    info.append(el('strong',null,item.name),chips);row.append(info);
    // Isolated visual-only outline, never a verified unlock or entitlement.
    if(typeof onPreview==='function'&&!owned&&tierEligible&&item.category!=='aviation'){
     acts.append(button(previewItemId===item.id?'Hide preview':'View on property',()=>{
      const next=previewItemId===item.id?null:item.id;
      const changed=onPreview(next);
      if(changed===false)throw Error('This upgrade cannot be previewed on this property.');
      previewItemId=next;render();
     },false,{aria:(previewItemId===item.id?'Hide preview of ':'Preview ')+item.name+' on this property'}));
    }
    const payable=!owned&&s.ownerAuthorized&&s.purchasesEnabled&&tierEligible;
    if(payable&&(!missing.length||viaCart||cartIds.has(item.id))){
     const inCart=cartIds.has(item.id),t=button(inCart?'✓ In cart':'+ Cart',()=>toggleCart(item),!!s.pending,{aria:(inCart?'Remove ':'Add ')+item.name+(inCart?' from':' to')+' the upgrade cart'});
     t.setAttribute('aria-pressed',inCart?'true':'false');t.dataset.cartToggle=item.id;acts.append(t);
    }
    if(payable&&!missing.length)
     acts.append(button('Buy',()=>buy(item),!!s.pending,{primary:true,aria:'Buy '+item.name+' for '+item.priceXrp+' XRP'}));
    if(acts.children.length)row.append(acts);
    catalogue.append(row);
   }
  }
  renderCart(s);
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
    ownerAuthorized:false,purchasesEnabled:!!v.purchasesEnabled,purchaseStatus:v.purchaseStatus||'not_activated'};catalog=v.catalog;
  }
  // The unauthenticated public state intentionally exposes only aggregate
  // development value; base shares are calculated using the authoritative catalog.
  current={state,catalog};render();
 }
 if(!availability.textContent)availability.textContent='Loading upgrades…',availability.dataset.tone='off';
 section.refresh=()=>load().catch(e=>{if(section.isConnected)message.textContent=e.message;});
 void section.refresh();return section;
}
