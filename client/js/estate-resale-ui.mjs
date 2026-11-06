// Estates marketplace views (Available / Owned / For sale / My properties) and owner resale UI.
// Server is authoritative: listings, ownership, and history come from /api/estates/market and /history;
// every buy/list action is re-checked server-side and stays disabled while resale is not activated.
export const VIEWS=Object.freeze(['available','owned','for-sale','mine']);
const SECTIONS={available:['catalog'],owned:['catalog'],'for-sale':['resale'],mine:['owned','wallet-controls','calculator']};
export function cardVisible(view,status,forSale=false){
 if(view==='available')return status==='available'||status==='sales-paused';
 if(view==='owned')return status==='owned'||status==='owned-by-you';
 if(view==='for-sale')return forSale;
 return true;
}
export function sectionVisible(view,id){return (SECTIONS[view]||[]).includes(id);}
export function formatDrops(d){try{const v=BigInt(String(d));const w=v/1000000n,f=(v%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return w.toString()+(f?'.'+f:'')+' XRP';}catch{return '—';}}
export function xrpToDrops(x){const m=/^\s*(\d{1,9})(?:\.(\d{1,6}))?\s*$/.exec(String(x));if(!m)return null;return String(BigInt(m[1])*1000000n+BigInt((m[2]||'').padEnd(6,'0')||'0'));}
export function shortWallet(a){return typeof a==='string'&&a.length>12?a.slice(0,6)+'…'+a.slice(-4):String(a||'');}
const RESALE_ERRORS={estate_resale_disabled:'Owner resales are not activated yet. Listings and purchases open after the final safety review.',not_property_owner:'Only the current owner can list this property.',already_listed:'This property is already listed.',listing_reserved:'Another buyer is completing this purchase. Try again shortly.',listing_closed:'This listing is no longer available.',cannot_buy_own_listing:'You already own this property.',invalid_ask:'Enter an asking price of at least 1 XRP.',seller_transfer_authorization_required:'Tick the box to approve the transfer at this price.',listing_void_owner_changed:'Ownership changed, so this listing was closed.',sign_in_with_xaman:'Sign in with Xaman in BURN City first.'};
export const resaleMessage=e=>RESALE_ERRORS[e]||'That did not go through. Please refresh and try again.';

export function mountEstateResale({doc=document,fetcher=fetch,storage=localStorage,api,win=globalThis}={}){
 api??=(/localhost|127\.0\.0\.1|fly\.dev$/.test(win.location?.hostname||'')?win.location.origin:'https://burn-city-game.fly.dev');
 const $=id=>doc.getElementById(id),make=(t,x,c)=>{const e=doc.createElement(t);if(x!==undefined)e.textContent=x;if(c)e.className=c;return e;};
 const token=()=>{try{return storage.getItem('bcToken')||'';}catch{return '';}};
 let market={resaleEnabled:false,owners:[],listings:[]},view='available',me='';
 async function call(path,body){
  const auth=token();const r=await fetcher(api+'/api/estates'+path,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',headers:{...(auth?{authorization:'Bearer '+auth}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let data={};try{data=await r.json();}catch{}return {status:r.status,data};
 }
 const listingFor=id=>market.listings.find(l=>l.propertyId===id);
 const ownerOf=id=>market.owners.find(o=>o.propertyId===id)?.owner||'';
 function applyView(){
  for(const b of doc.querySelectorAll('#estate-views [data-view]'))b.setAttribute('aria-selected',String(b.dataset.view===view));
  for(const id of ['owned','wallet-controls','calculator','catalog','resale']){const s=$(id);if(!s)continue;if(sectionVisible(view,id))s.removeAttribute('data-hidden-by-view');else s.setAttribute('data-hidden-by-view','');}
  for(const c of doc.querySelectorAll('#properties article[data-property-id]')){
   const ok=cardVisible(view,c.dataset.propertyStatus,!!listingFor(c.dataset.propertyId));
   if(ok)c.removeAttribute('data-hidden-by-view');else c.setAttribute('data-hidden-by-view','');
  }
 }
 function historyButton(propertyId){
  const box=make('div'),b=make('button','Ownership history');b.type='button';
  b.addEventListener('click',async()=>{if(box.childElementCount){box.replaceChildren();return;}
   const {data}=await call('/history?propertyId='+encodeURIComponent(propertyId));const ol=make('ol',undefined,'history-list');
   for(const h of data.history||[])ol.append(make('li',new Date(h.at).toLocaleDateString()+' · '+(h.kind==='primary'?'Purchased':'Resold')+' to '+shortWallet(h.toAcct)+' · '+formatDrops(h.priceDrops)));
   box.replaceChildren(ol.childElementCount?ol:make('p','No recorded transfers yet.','muted'));});
  const w=make('div');w.append(b,box);return w;
 }
 function listForm(propertyId,existing){
  const f=make('form',undefined,'resale-form');
  const price=make('input');price.inputMode='decimal';price.placeholder='Asking price in XRP';price.required=true;if(existing)price.value=formatDrops(existing.askDrops).replace(' XRP','');
  const lab=make('label','Asking price (XRP)');lab.append(price);
  const ok=make('input');ok.type='checkbox';const chk=make('label',undefined,'check');chk.append(ok,make('span','I approve transferring this property to the buyer who pays this exact price to my wallet. No marketplace fee; XRPL network fees apply.'));
  const go=make('button',existing?'Update price':'List for sale');go.type='submit';const msg=make('p','', 'muted');msg.setAttribute('role','status');
  f.append(lab,chk,go);
  if(existing){const c=make('button','Cancel listing');c.type='button';c.addEventListener('click',async()=>{const r=await call('/resale/cancel',{listingId:existing.listingId});msg.textContent=r.data.ok?'Listing cancelled.':resaleMessage(r.data.error);await load();});f.append(c);}
  f.append(msg);
  if(!market.resaleEnabled){go.disabled=true;msg.textContent=resaleMessage('estate_resale_disabled');}
  f.addEventListener('submit',async e=>{e.preventDefault();const askDrops=xrpToDrops(price.value);if(!askDrops){msg.textContent=resaleMessage('invalid_ask');return;}
   const r=await call(existing?'/resale/reprice':'/resale/list',{propertyId,listingId:existing?.listingId,askDrops,approveTransfer:ok.checked});
   msg.textContent=r.data.ok?'Listed at '+formatDrops(askDrops)+'.':resaleMessage(r.data.error);if(r.data.ok)await load();});
  return f;
 }
 async function buy(listing,out){
  out.textContent='Reserving…';
  const r=await call('/resale/reserve',{listingId:listing.listingId});if(!r.data.ok){out.textContent=resaleMessage(r.data.error);return;}
  const res=r.data.reservation,p=await call('/resale/payment/start',{reservationId:res.reservationId});
  if(!p.data.ok){out.textContent=resaleMessage(p.data.error);return;}
  out.replaceChildren(make('p','Approve '+formatDrops(res.amountDrops)+' to '+shortWallet(res.destination)+' in Xaman.'));
  const a=make('a','Open Xaman','action-link');a.href=p.data.deeplink;a.target='_blank';a.rel='noopener noreferrer';out.append(a);
  for(let i=0;i<60;i++){await new Promise(z=>setTimeout(z,5000));const c=await call('/resale/payment/confirm',{reservationId:res.reservationId});
   if(c.data.ok){out.replaceChildren(make('p','Purchase confirmed on the XRPL. The property is now yours.','badge'));await load();return;}
   if(!c.data.pending){out.textContent=resaleMessage(c.data.error);return;}}
  out.textContent='Still waiting for the ledger. Refresh later; your reservation is tracked.';
 }
 function renderListings(){
  const box=$('resale-listings');if(!box)return;box.replaceChildren();
  $('resale-status').textContent=(market.resaleEnabled?'Owner resales are open. ':'Owner resales are not activated yet; listings are view-only. ')+market.listings.length+' listed.';
  for(const l of market.listings){
   const a=make('article');a.dataset.listingId=l.listingId;a.dataset.forSale='true';
   a.append(make('h3',l.propertyId),make('p','Asking '+formatDrops(l.askDrops)),make('p','Owner '+shortWallet(l.seller),'owner-line'),make('p',l.status==='reserved'?'A buyer is completing payment':'Listed','muted'));
   const out=make('div');out.setAttribute('role','status');
   if(l.seller===me)a.append(listForm(l.propertyId,l));
   else{const b=make('button','Buy for '+formatDrops(l.askDrops));b.type='button';b.disabled=!market.resaleEnabled||l.status!=='active';b.addEventListener('click',()=>buy(l,out));a.append(b);}
   a.append(historyButton(l.propertyId),out);box.append(a);
  }
  if(!market.listings.length)box.append(make('p','No properties are listed by owners right now.','muted'));
 }
 function decorate(){
  for(const c of doc.querySelectorAll('#properties article[data-property-id]')){
   if(c.dataset.resaleDecorated)continue;c.dataset.resaleDecorated='1';const id=c.dataset.propertyId,o=ownerOf(id),l=listingFor(id);
   if(o)c.insertBefore(make('p','Owner '+shortWallet(o),'owner-line'),c.children[1]||null);
   if(l){c.dataset.forSale='true';c.append(make('p','For sale by owner · '+formatDrops(l.askDrops),'badge'));}
   c.append(historyButton(id));
  }
  for(const c of doc.querySelectorAll('#owned-properties article[data-owned-property]')){
   if(c.dataset.resaleDecorated)continue;c.dataset.resaleDecorated='1';const id=c.dataset.ownedProperty,l=listingFor(id);
   me=ownerOf(id)||me;const b=make('button',l?'Manage listing':'Sell this property');b.type='button';const slot=make('div');
   b.addEventListener('click',()=>{slot.childElementCount?slot.replaceChildren():slot.replaceChildren(listForm(id,l));});c.append(b,slot,historyButton(id));
  }
  applyView();
 }
 async function load(){
  try{const {data}=await call('/market');market={resaleEnabled:data.resaleEnabled===true,owners:data.owners||[],listings:data.listings||[]};}
  catch{const s=$('resale-status');if(s)s.textContent='Resale listings could not load. Please refresh.';}
  for(const e of doc.querySelectorAll('[data-resale-decorated]'))delete e.dataset.resaleDecorated;
  for(const e of doc.querySelectorAll('#properties .owner-line,#properties .badge,#properties .history-list'))e.remove();
  renderListings();decorate();
 }
 for(const b of doc.querySelectorAll('#estate-views [data-view]'))b.addEventListener('click',()=>{view=b.dataset.view;applyView();});
 const mo=new win.MutationObserver(()=>decorate());for(const id of ['properties','owned-properties']){const e=$(id);if(e)mo.observe(e,{childList:true});}
 applyView();load();
 return {load,setView:v=>{if(VIEWS.includes(v)){view=v;applyView();}},state:()=>({view,market})};
}
if(typeof document!=='undefined'&&document.getElementById('estate-views'))window.__estateResale=mountEstateResale();
