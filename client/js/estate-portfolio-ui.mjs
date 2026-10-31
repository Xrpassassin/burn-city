import {mountEstatePurchase,mountEstateImgTrustline} from './estate-purchase-ui.mjs';
import {formatRewardUnits,sharePercent,rewardScenario} from './estate-reward-scenario.mjs';

export function mountEstatePortfolio({doc=document,fetcher=fetch,storage=localStorage,api}={}){
 api??=(/localhost|127\.0\.0\.1|fly\.dev$/.test(location.hostname)?location.origin:'https://burn-city-game.fly.dev');
 const $=id=>doc.getElementById(id),make=(tag,text,cls)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 let catalog=null,current=null,generation=0,lastToken=null,disposed=false,trustlineDispose=null;
 const token=()=>{try{return storage.getItem('bcToken')||'';}catch{return '';}};
 const field=(label,value)=>make('p',label+': '+value);
 function cityLink(propertyId,label='Locate in 3D city'){
  const a=make('a',label,'action-link');a.href='./?estateProperty='+encodeURIComponent(propertyId);return a;
 }
 function action(label,fn){const b=make('button',label);b.type='button';b.addEventListener('click',fn);return b;}
 async function request(path,auth='',body){
  const r=await fetcher(api+'/api/estates'+path,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{...(auth?{authorization:'Bearer '+auth}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw Error(r.status===401?'Sign in again with Xaman in BURN City.':'Live data could not be loaded. Please refresh.');return data;
 }
 function renderStatus(s){
  $('live-status').textContent=s.salesEnabled?'Property sales are open.':s.salesStatus==='treasury_paused'?'Property purchases are temporarily paused.':'Property purchases are currently unavailable.';
  $('reward-status').textContent=s.distributionsEnabled?'Hourly reward processing is enabled.':'Hourly reward processing is currently unavailable or delayed.';
  const allocation=$('allocation-status');if(allocation)allocation.textContent=s.capitalAllocationPolicy?.version===2?'New purchases: 99% allocated to IMG/RLUSD; 1% retained for XRP operating costs. '+(s.imgRlusdFundingEnabled?'Pool routing enabled.':'Pool routing awaits activation; proceeds remain reserved in the treasury.'):'Checking purchase allocation policy…';
  const pool=$('pool-status');if(pool)pool.textContent=(s.imgRlusdPositionCount??s.liquidityPositions?.length??0)+' tracked IMG/RLUSD positions · '+({awaiting_pool_activation:'Awaiting pool activation',enabled:'Processing enabled',treasury_paused:'Treasury paused',disabled:'Routing disabled'}[s.imgRlusdStatus]||'Processing delayed or requires review')+'.';
 }
 function renderCatalog(){
  if(!catalog)return;const tiers=new Map(catalog.tiers.map(t=>[t.id,t])),owned=new Set((current?.owned||[]).map(p=>p.propertyId));
  $('properties').replaceChildren();
  for(const p of catalog.properties){
   const t=tiers.get(p.tier);if(!t)continue;const card=make('article');card.dataset.propertyId=p.id;
   card.append(make('h3',p.address||p.id),field(t.label,t.price+' XRP'),field('Allocation weight',t.shareUnits+' share units'),cityLink(p.id));
   if(owned.has(p.id))card.append(make('p','Owned by you','badge'));
   const target=make('div');card.append(action(owned.has(p.id)?'Manage this property':'Check availability / buy',()=>{
    target.replaceChildren();mountEstatePurchase(target,p.id,{api,fetcher,storage,onSettled:()=>{if(!owned.has(p.id))void refresh();}});
   }),target);$('properties').append(card);
  }
 }
 function clearPrivate(message){
  trustlineDispose?.();trustlineDispose=null;current=null;$('scenario-property').replaceChildren();$('payout-currency').value='';$('preference-status').textContent='';$('history-through').textContent='';$('owned-properties').replaceChildren(make('p',message));$('portfolio-summary').textContent='';
  $('wallet-history').replaceChildren();$('wallet-controls').hidden=true;$('scenario-fields').disabled=true;
  $('scenario-result').textContent='Sign in to calculate from your verified property shares.';
  renderCatalog();
 }
 function renderHistory(s){
  const list=$('wallet-history');list.replaceChildren();
  const labels={queued:'Awaiting payment',preparing:'Preparing payment',submitted:'Awaiting ledger validation',confirmed:'Payment confirmed',held:'Held for review'};
  const add=(text,hash)=>{const p=make('p',text);if(/^[A-Fa-f0-9]{64}$/.test(hash||'')){const a=make('a',' View transaction');a.href='https://livenet.xrpl.org/transactions/'+hash;a.target='_blank';a.rel='noopener noreferrer';p.append(a);}list.append(p);};
  for(const r of (s.payouts||[]).slice(0,20)){
   let amount='Amount pending settlement';
   if(r.state==='confirmed'&&r.delivered){try{const d=JSON.parse(r.delivered);if(typeof d==='string'&&/^\d+$/.test(d))amount=formatRewardUnits(d)+' XRP';else if(d?.currency==='IMG'&&typeof d.value==='string')amount=d.value+' IMG';}catch{}}
   const reason=({recipient_img_trustline_unavailable:'An IMG trustline is needed in the receiving wallet.',owner_currency_selection_required:'Choose IMG or XRP above.',daily_payment_budget_limit:'Waiting for the next payment budget.',unfunded_img_liabilities:'Awaiting verified funding.',below_net_reward_minimum_carried:'Accrued toward a future payout after fees.',funding_reward_network_fees:'Funding fees from earned IMG.',awaiting_net_reward_payment:'Preparing reward after fees.',reward_transaction_review_required:'Held for review; no automatic replacement.'})[r.note];
   add('Reward hour '+new Date(r.epoch_start_ms).toLocaleString()+' · IMG earnings · '+(r.note==='below_net_reward_minimum_carried'?'Accrued for a future payout':labels[r.state]||'Pending')+' · '+amount+(reason?' · '+reason:''),r.tx_hash);
  }
  for(const r of (s.xrpProfitPayouts||[]).slice(0,20)){
   let amount=formatRewardUnits(r.amount_drops)+' XRP equivalent allocated';
   if(r.state==='confirmed'&&r.delivered){try{const d=JSON.parse(r.delivered);amount=typeof d==='string'?formatRewardUnits(d)+' XRP delivered':d.value+' IMG delivered';}catch{amount='Delivery requires review';}}
   else if(r.state==='confirmed')amount=formatRewardUnits(r.amount_drops)+' XRP delivered';
   add('Eligible after '+new Date(r.available_after_ms).toLocaleString()+' · '+(r.payout_policy===2?'IMG/RLUSD realized profit':'Legacy XRP pool profit')+' · '+amount+' · '+(r.carried?'Accrued for a future payout':r.note==='reward_transaction_review_required'?'Held for review':labels[r.state]||'Pending')+(r.note==='owner_currency_selection_required'?' · Choose IMG or XRP above.':r.note==='recipient_img_trustline_unavailable'?' · An IMG trustline is needed.':r.note==='quote_expired_review_required'?' · Conversion quote needs review.':''),r.tx_hash);
  }
  for(const [key,asset] of [['rewardXrpCreditDrops','XRP'],['rewardImgCreditUnits','IMG']])if(BigInt(s[key]||'0')>0n)add('Retained '+asset+' reward credit: '+formatRewardUnits(s[key])+' '+asset+'. Included in a future eligible payout.');
  if(BigInt(s.xrpProfitCreditDrops||'0')>0n)add('Unpaid XRP reward credit: '+formatRewardUnits(s.xrpProfitCreditDrops)+' XRP. Included with a future eligible payment.');
  if(!list.childElementCount)list.append(make('p','No wallet payments recorded yet. Allocations appear separately from confirmed payments.'));
 }
 function renderPortfolio(s){
  current=s;const report=s.portfolio,records=new Map(report.properties.map(p=>[p.propertyId,p]));
  $('portfolio-summary').textContent=report.portfolioShareUnits+' / '+report.totalShareUnits+' current share units · '+sharePercent(report.portfolioShareUnits,report.totalShareUnits)+'% of current eligible weight. This is a reward share, not a fixed payout rate.';
  $('owned-properties').replaceChildren();
  if(!s.owned.length)$('owned-properties').append(make('p','No verified properties in this wallet yet.'));
  for(const p of s.owned){
   const r=records.get(p.propertyId),card=make('article');card.dataset.ownedProperty=p.propertyId;
   card.append(make('h3',p.property?.address||p.propertyId),make('p',p.tier?.label||p.property?.tier||''),
    field('Current reward share',sharePercent(p.shareUnits,report.totalShareUnits)+'% ('+p.shareUnits+' units)'));
   const funding=s.capitalAllocations?.find(a=>a.property_id===p.propertyId)?.fundingState;
   const allocation=s.capitalAllocations?.find(a=>a.property_id===p.propertyId);if(allocation)card.append(field('Investment pool',allocation.pool||'Legacy allocation'));
   card.append(field('Pool funding',({awaiting_pool:'Awaiting IMG/RLUSD pool activation',invested:'Invested',in_progress:'In progress',pending:'Awaiting execution',review_needed:'Awaiting review'})[funding]||'Status unavailable'));
   const img=report.imgHistoryAvailable&&r,xrp=report.xrpHistoryAvailable&&r;
   card.append(field('IMG allocated · last 24h',img?formatRewardUnits(r.imgAllocated24hUnits)+' IMG':'History unavailable'),
    field('Approx. historical hourly average',img?formatRewardUnits(r.imgAverageHourlyUnits)+' IMG/h':'Unavailable'),
    field('XRP profit allocated · last 24h',xrp?formatRewardUnits(r.xrpAllocated24hDrops)+' XRP':'History unavailable'),
    field('Approx. historical hourly average',xrp?formatRewardUnits(r.xrpAverageHourlyDrops)+' XRP/h':'Unavailable'),
    make('p','24-hour averages include zero-reward hours. Allocations are before delivery costs and may still be awaiting payment; they do not predict future earnings.','muted'),cityLink(p.propertyId));
   $('owned-properties').append(card);
  }
  $('history-through').textContent=report.dataThroughMs?'IMG ledger coverage through '+new Date(report.dataThroughMs).toLocaleString()+(report.scannerCurrent?'':'. Coverage is delayed; recent allocations may be missing.'):'Verified ledger coverage is not available yet.';
  $('wallet-controls').hidden=false;$('payout-currency').value=s.payoutPreference?.currency||'';
  trustlineDispose?.();const auth=token();trustlineDispose=mountEstateImgTrustline($('wallet-controls'),$('payout-currency'),{doc,request:async(path,body)=>{if(token()!==auth)throw Error('Your wallet changed. Refresh the portfolio.');const r=await request(path,auth,body);if(token()!==auth)throw Error('Your wallet changed. Refresh the portfolio.');return r;}});

  renderHistory(s);renderScenarioOptions();renderCatalog();
 }
 function renderScenarioOptions(){
  const select=$('scenario-property'),prior=select.value;select.replaceChildren();
  const add=(v,t)=>{const o=make('option',t);o.value=v;select.append(o);};
  add('portfolio','All my properties');for(const p of current?.owned||[])add(p.propertyId,p.property?.address||p.propertyId);
  if([...select.options].some(o=>o.value===prior))select.value=prior;
  $('scenario-fields').disabled=!(current?.owned?.length);calculate();
 }
 function calculate(){
  if(!current?.owned?.length){$('scenario-result').textContent='A verified owned property is required for this calculator.';return;}
  try{
   const id=$('scenario-property').value,weight=id==='portfolio'?current.portfolio.portfolioShareUnits:current.owned.find(p=>p.propertyId===id)?.shareUnits;
   const result=rewardScenario({netEarnings:$('scenario-net').value,shareUnits:weight,totalShareUnits:current.portfolio.totalShareUnits});
   $('scenario-result').textContent='Hypothetical allocation: '+result.amount+' '+$('scenario-asset').value+' for the selected '+$('scenario-period').value+' scenario ('+result.sharePercent+'% current share).';
  }catch(e){$('scenario-result').textContent=e.message;}
 }
 async function refresh(){
  const seq=++generation,auth=token();if(auth!==lastToken)$('scenario-net').value='0';lastToken=auth;
  $('live-status').textContent='Checking live sales status…';$('reward-status').textContent='Checking reward processing…';
  clearPrivate(auth?'Loading verified ownership…':'Sign in with Xaman in BURN City, then refresh this page to view your properties.');
  $('session-status').textContent=auth?'Loading your wallet portfolio…':'No Xaman wallet session on this page.';
  const results=await Promise.allSettled([request('/status'),auth?request('/portfolio',auth):Promise.resolve(null)]);
  if(disposed||seq!==generation)return;if(token()!==auth){void refresh();return;}
  if(results[0].status==='fulfilled')renderStatus(results[0].value);else{$('live-status').textContent='Live sales status unavailable. Please refresh.';$('reward-status').textContent='Reward status unavailable.';}
  if(results[1].status==='fulfilled'&&results[1].value){renderPortfolio(results[1].value);renderStatus(results[1].value);$('session-status').textContent='Verified wallet portfolio loaded.';}
  else if(auth){clearPrivate('Portfolio unavailable. '+(results[1].reason?.message||'Please refresh.'));$('session-status').textContent=results[1].reason?.message||'Portfolio unavailable.';}
 }
 const onStorage=e=>{if(e.key==='bcToken'||e.key===null)void refresh();};
 const onFocus=()=>{if(token()!==lastToken)void refresh();};
 $('refresh-portfolio').addEventListener('click',()=>void refresh());
 $('save-preference').addEventListener('click',async()=>{
  const auth=token(),currency=$('payout-currency').value;if(!auth||!currency){$('preference-status').textContent='Choose IMG or XRP while signed in.';return;}
  $('save-preference').disabled=true;
  try{await request('/payout-preference',auth,{currency});if(token()===auth)$('preference-status').textContent='Wallet payout preference saved. Existing payout requests may retain their original currency. New IMG/RLUSD profits follow your selected payout currency; already-created payments retain their currency.';}
  catch(e){$('preference-status').textContent=e.message;}finally{$('save-preference').disabled=false;}
 });
 for(const id of ['scenario-property','scenario-net','scenario-asset','scenario-period'])$(id).addEventListener('input',calculate);
 doc.defaultView?.addEventListener('storage',onStorage);doc.defaultView?.addEventListener('focus',onFocus);
 const ready=(async()=>{try{const r=await fetcher('./data/estate-catalog.json',{cache:'no-store'});if(!r.ok)throw Error('catalog');catalog=await r.json();if(!Array.isArray(catalog.properties)||!Array.isArray(catalog.tiers))throw Error('catalog');renderCatalog();}catch{$('properties').textContent='The property catalog could not be loaded. Please refresh.';}await refresh();})();
 return {ready,refresh,dispose(){trustlineDispose?.();disposed=true;generation++;doc.defaultView?.removeEventListener('storage',onStorage);doc.defaultView?.removeEventListener('focus',onFocus);}};
}
