'use strict';
(()=>{
 const $=id=>document.getElementById(id),container=$('properties'),status=$('status'),quote=$('quote');
 let catalog=null;
 function element(tag,text){const el=document.createElement(tag);el.textContent=String(text);return el;}
 async function check(propertyId){
  const token=$('bearer').value.trim();
  if(!token){status.textContent='Sign in with Xaman and provide your bearer token to check availability.';return;}
  status.textContent='Checking server quote…';quote.textContent='';
  try{
   const response=await fetch('/api/estates/purchase/quote?propertyId='+encodeURIComponent(propertyId),{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit'});
   const data=await response.json();
   quote.textContent=JSON.stringify(data,null,2);
   status.textContent=data.ok?'Quote loaded. Property sales are still disabled.':'Quote unavailable: '+(data.error||response.status);
  }catch(e){status.textContent='Quote request failed: '+e.message;}
 }
 async function init(){
  try{
   const response=await fetch('/data/estate-catalog.json',{cache:'no-store'});
   if(!response.ok)throw new Error('catalog_unavailable');
   catalog=await response.json();
   if(!Array.isArray(catalog.properties)||!Array.isArray(catalog.tiers))throw new Error('invalid_catalog');
   const tiers=new Map(catalog.tiers.map(t=>[t.id,t]));
   container.replaceChildren();
   for(const property of catalog.properties){
    const tier=tiers.get(property.tier);if(!tier)continue;
    const card=document.createElement('article');
    card.append(element('h2',property.address||property.label||property.name||property.id));
    card.append(element('p',tier.label+' · '+tier.price+' XRP'));
    card.append(element('p',tier.shareUnits+' allocation unit(s) — distributions disabled'));
    const button=element('button','Check availability');
    button.addEventListener('click',()=>check(property.id));card.append(button);container.append(card);
   }
   if(!container.children.length)container.append(element('p','No properties available in catalog.'));
  }catch(e){container.textContent='Unable to load properties: '+e.message;}
 }
 $('clear').addEventListener('click',()=>{$('bearer').value='';quote.textContent='Token cleared.';status.textContent='';});
 init();
})();
