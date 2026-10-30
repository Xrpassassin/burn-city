// Owner preview + Xaman handoff. Server quotes, bound payloads and validated
// ledger receipts are the only inputs that can persist a property upgrade.
const xrp=d=>{const n=BigInt(d||0);return (n/1000000n).toString()+(n%1000000n?'.'+(n%1000000n).toString().padStart(6,'0').replace(/0+$/,''):'');};
export function mountEstatePrestige(container,propertyId,{api='',fetcher=fetch,storage=localStorage,onPreview=()=>{},onConfirmed=()=>{}}={}){
 const section=document.createElement('section');section.dataset.estatePrestige=propertyId;section.style.cssText='margin-top:16px;padding-top:12px;border-top:1px solid #9d794b';
 const heading=document.createElement('h4');heading.textContent='Make this property your own';
 const note=document.createElement('p'),actions=document.createElement('div');section.append(heading,note,actions);container.append(section);
 let current=null,upgradeId='',busy=false;
 const messages={cosmetic_upgrades_disabled:'Cosmetic upgrades are not open yet.',estate_treasury_paused:'Upgrades are currently paused.',property_owner_required:'Only the verified property owner can upgrade this home.',upgrade_payload_pending:'Your signing request is being prepared. Reopen this property to check again.',upgrade_payload_requires_review:'This request needs review before another payment can be created.',upgrade_expired_requires_review:'This request expired. Check its payment before starting another upgrade.',upgrade_not_found:'This upgrade could not be found for your wallet.',property_owner_changed:'Property ownership changed. This payment requires review.',slow_down:'Please wait a moment before checking again.'};
 async function request(path,body){
  const token=storage.getItem('bcToken');if(!token)throw Error('Sign in with Xaman to view your upgrade options.');
  const response=await fetcher(api+'/api/estates/upgrade/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok&&response.status!==202)throw Error(messages[data.error]||'The upgrade could not be completed. Reopen this property to check its status.');return data;
 }
 function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();}catch(e){note.textContent=e.message;}finally{busy=false;if(b.isConnected)b.disabled=false;}};actions.append(b);}
 function openLink(url){try{const parsed=new URL(url);if(parsed.protocol!=='https:')return;const a=document.createElement('a');a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Review cosmetic upgrade in Xaman';a.style.cssText='display:block;padding:12px;color:#ffd28c';actions.append(a);}catch{}}
 async function confirm(){const r=await request('confirm',{upgradeId});if(r.ok){onConfirmed(r.appearance);onPreview(null);await load();}else note.textContent='Waiting for your signed payment to validate. Your current appearance is unchanged.';}
 async function start(){const r=await request('start',{propertyId});upgradeId=r.upgradeId;actions.replaceChildren();note.textContent='Review this cosmetic upgrade in Xaman. Your property changes after the payment is verified.';openLink(r.deeplink);button('Check upgrade payment',confirm);}
 async function load(){
  if(storage.getItem('bcToken'))current=await request('quote?propertyId='+encodeURIComponent(propertyId));
  else {const response=await fetcher(api+'/api/estates/appearance');if(!response.ok)throw Error('Property finishes are temporarily unavailable.');const state=await response.json(),property=state.properties?.find(p=>p.propertyId===propertyId);if(!property)throw Error('Property not found.');current={...property,previewPurchase:property.purchaseAppearance,canUpgrade:false,upgradesEnabled:false};}
  if(!section.isConnected)return;
  actions.replaceChildren();
  if(!current.owned){const preview=current.previewPurchase;note.textContent='Purchase appearance: '+preview.label+'. '+preview.features.join(' · ')+'. Your purchase counts toward future cosmetic stages.';button('Preview purchase appearance',()=>{onPreview(preview.level);note.textContent='PREVIEW ONLY · '+preview.label+'. No payment has been made.';});button('Show current property',async()=>{onPreview(null);await load();});return;}
  note.textContent=current.label+' · '+xrp(current.totalSpentDrops)+' XRP invested in this property. '+(current.next?'Next: '+current.next.label+' for '+xrp(current.next.remainingDrops)+' XRP. '+current.next.features.join(' · ')+'.':'All cosmetic stages unlocked.')+' Cosmetic upgrades keep your '+current.shareUnits+' reward share units unchanged.';
  if(current.next){button('Preview '+current.next.label,()=>{onPreview(current.next.level);note.textContent='PREVIEW ONLY · '+current.next.label+'. '+current.next.features.join(' · ')+'. No XRP spent; current reward shares stay the same.';});button('Show current property',async()=>{onPreview(null);await load();});}
  if(current.pending){upgradeId=current.pending.upgradeId;button('Check existing upgrade payment',confirm);if(current.upgradesEnabled)button('Continue existing Xaman request',start);}
  else if(current.canUpgrade&&current.upgradesEnabled)button('Review upgrade in Xaman',start);
  else if(current.canUpgrade){const p=document.createElement('p');p.textContent='Upgrade preview only. XRP upgrades are not open yet.';actions.append(p);}
 }
 section.refresh=()=>load().catch(e=>{if(section.isConnected)note.textContent=e.message;});
 void load().catch(e=>{if(section.isConnected)note.textContent=e.message;});return section;
}
