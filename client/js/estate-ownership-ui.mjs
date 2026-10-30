import {formatRewardUnits} from './estate-reward-scenario.mjs';
// Public ownership is separate from private, server-authenticated reward data.
export function mountEstateOwnership(container,propertyId,{api='https://burn-city-game.fly.dev',fetcher=fetch,storage=localStorage,onOwnership=()=>{}}={}){
 const section=document.createElement('section');section.dataset.estateOwnership=propertyId;
 const ownerLine=document.createElement('p');ownerLine.textContent='Checking verified ownership…';ownerLine.style.overflowWrap='anywhere';section.append(ownerLine);container.append(section);
 const privateBlock=document.createElement('div');section.append(privateBlock);
 let auth='',publicLoaded=false;try{auth=storage.getItem('bcToken')||'';}catch{}
 const current=()=>section.isConnected&&(()=>{try{return (storage.getItem('bcToken')||'')===auth;}catch{return !auth;}})();
 const p=text=>{const e=document.createElement('p');e.textContent=text;privateBlock.append(e);return e;};
 const view=section.ownerDocument.defaultView;
 const onWalletChange=()=>{if(section.isConnected&&!current()){privateBlock.replaceChildren();p('Wallet changed. Inspect this property again to load your reward summary.');}};
 view?.addEventListener('storage',onWalletChange);view?.addEventListener('focus',onWalletChange);
 const dispose=()=>{view?.removeEventListener('storage',onWalletChange);view?.removeEventListener('focus',onWalletChange);observer.disconnect();};
 const observer=new MutationObserver(()=>{if(!section.isConnected)dispose();});observer.observe(container,{childList:true});
 const ready=(async()=>{
  try{
   const r=await fetcher(api+'/api/estates/ownership',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('ownership_unavailable');const s=await r.json();
   if(!Array.isArray(s.properties))throw Error('ownership_unavailable');if(!current())return;
   onOwnership(s.properties);const property=s.properties.find(x=>x.propertyId===propertyId);
   if(!property){ownerLine.textContent='Unowned property · yellow border';return;}
   if(!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(property.owner||''))throw Error('ownership_unavailable');
   ownerLine.textContent='Verified owner: '+property.owner+' · purchased · blue border';publicLoaded=true;
   if(!auth){p('Sign in with the owning wallet to see your reward summary.');return;}
   const privateResponse=await fetcher(api+'/api/estates/portfolio',{cache:'no-store',credentials:'omit',headers:{authorization:'Bearer '+auth},signal:AbortSignal.timeout(10000)});
   if(!privateResponse.ok){if(current())p('Sign in again with the owning wallet to view your rewards.');return;}
   const state=await privateResponse.json();if(!current()||!state.owned?.some(x=>x.propertyId===propertyId))return;
   p('You own this property.');
   const row=state.portfolio?.properties?.find(x=>x.propertyId===propertyId),received=state.portfolio?.walletReceived;
   if(row){p('This property · recorded allocations in the last 24h: '+(state.portfolio.imgHistoryAvailable?formatRewardUnits(row.imgAllocated24hUnits)+' IMG':'IMG history unavailable')+' · '+(state.portfolio.xrpHistoryAvailable?formatRewardUnits(row.xrpAllocated24hDrops)+' XRP':'XRP history unavailable'));}
   if(received?.complete)p('Your wallet rewards received · all properties: '+formatRewardUnits(received.imgUnits)+' IMG · '+formatRewardUnits(received.xrpDrops)+' XRP');
   else p('Confirmed wallet reward totals are unavailable. View individual payments in your portfolio.');
   p('Received rewards are shown separately by asset. This is not net investment profit and does not account for purchase costs or changes in pool values.');
   const link=document.createElement('a');link.href='./estate-properties.html#owned';link.textContent='Open owned properties & payment history';link.style.color='#a7d3ff';privateBlock.append(link);
  }catch{if(current()){if(publicLoaded)p('Your reward summary could not be loaded. Please inspect this property again.');else ownerLine.textContent='Ownership could not be refreshed. Please inspect the home again.';}}
 })();return {section,ready,dispose};
}
