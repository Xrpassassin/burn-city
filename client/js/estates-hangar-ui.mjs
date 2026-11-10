// Owner-only estate hangar UI. Server stores property-scoped customizations and local flight journals.
// Flight achievements are client-reported and have no monetary/token rewards.
const milestoneLabels=Object.freeze({
 firstLanding:'First home landing',frequentPilot:'10 recorded flights',
 allLookouts:'All three viewpoints',oneFlightCircuit:'Three-stop grand circuit'
});
const stopNames=Object.freeze({
 'north-lookout':'North Shore','east-coast':'Eastern Lake','south-lake':'Southern Lake'
});
export function mountEstateHangarLogbook(container,propertyId,{api='',fetcher=fetch,storage=localStorage,onStyle=()=>{}}={}){
 if(!container?.appendChild||typeof propertyId!=='string')throw TypeError('hangar_ui_container_required');
 const root=document.createElement('section');root.dataset.estateHangar=propertyId;
 root.style.cssText='margin-top:10px;padding-top:10px;border-top:1px solid #5fa0b766';
 const status=document.createElement('p');status.setAttribute('role','status');
 status.style.cssText='font:12px/1.5 system-ui;color:#ffce96';
 root.appendChild(status);container.appendChild(root);
 let busy=false;
 async function request(path,body){
  const token=storage?.getItem('bcToken');
  if(!token)throw Error('Connect the owning Xaman wallet to open this hangar.');
  const res=await fetcher(api+'/api/estates/tycoon/hangar'+path,{
   method:body?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+token,
    'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const json=await res.json();
  if(!res.ok||json.ok!==true)
   throw Error(({property_owner_required:'Only the verified estate owner may manage this hangar.',
    helicopter_not_unlocked:'Purchase and verify the helicopter upgrade to open the hangar.',
    helicopter_tier_restricted:'Private aircraft are available to Family and Mansion estates only.',
    invalid_hangar_style:'Choose an approved paint, trim and callsign.'})[json.error]||'Hangar connection or authorization unavailable.');
  return json;
 }
 function element(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
 function button(text,onClick){const b=element('button',text);b.type='button';
  b.style.cssText='margin:4px 5px 4px 0;padding:8px 10px;min-height:40px;color:white;background:#254454;border:1px solid #6aa4b2;border-radius:8px;cursor:pointer';
  b.onclick=()=>void onClick();return b;}
 function selector(title,choices,value){
  const label=element('label',title);label.style.cssText='display:inline-flex;gap:5px;flex-direction:column;margin:4px 8px 4px 0;font-size:12px';
  const select=document.createElement('select');select.setAttribute('aria-label',title);
  select.style.cssText='background:#172e42;color:white;padding:8px;border:1px solid #678ea4;border-radius:6px';
  for(const id of choices){const opt=document.createElement('option');opt.value=id;opt.textContent=id.toUpperCase();select.append(opt);}
  select.value=value;label.append(select);return {label,select};
 }
 function display(data){
  if(!root.isConnected)return;
  root.replaceChildren();
  root.appendChild(element('h4','ESTATE HANGAR · '+data.style.callsign));
  const summary=element('p',data.totals.completedFlights+' completed flights · '+Math.floor(data.totals.flightSeconds/60)+' recorded minutes · '+data.totals.stopIds.length+'/3 viewpoints');
  root.appendChild(summary);
  const note=element('p','Personal flight journal · checkpoints are client-reported, not independently verified. No XRP, token, or payout rewards.');
  note.style.cssText='font-size:12px;opacity:.82';root.appendChild(note);
  const badges=element('div','');
  for(const [key,label] of Object.entries(milestoneLabels)){
   const badge=element('span',(data.milestones[key]?'✓ ':'○ ')+label);
   badge.style.cssText='display:inline-block;margin:3px;padding:5px;border:1px solid #6799a588;border-radius:12px;font-size:11px';
   badges.append(badge);
  }
  root.append(badges,element('h5','Customize your helicopter'));
  const paint=selector('Airframe paint',data.choices.paints,data.style.paint),
    trim=selector('Accent trim',data.choices.trims,data.style.trim);
  root.append(paint.label,trim.label);
  const callsignLabel=element('label','Aircraft callsign');callsignLabel.style.cssText='display:block;margin:6px 0;font-size:12px';
  const callsign=document.createElement('input');callsign.type='text';callsign.maxLength=16;
  callsign.value=data.style.callsign;callsign.autocapitalize='characters';
  callsign.style.cssText='display:block;padding:8px;background:#162b3a;color:white;border:1px solid #6799a5;border-radius:7px;width:min(220px,90%)';
  callsignLabel.append(callsign);root.append(callsignLabel);
  root.append(button('Save helicopter appearance',async()=>{
   if(busy)return;busy=true;
   try{const next=await request('/style',{propertyId,paint:paint.select.value,trim:trim.select.value,
     callsign:callsign.value.trim().toUpperCase()});
    onStyle(propertyId,next.style);display(next);
    status.textContent='';root.append(status);status.textContent='Hangar appearance saved to this property.';
   }catch(e){status.textContent=e.message;root.append(status);}finally{busy=false;}
  }));
  root.append(button('Refresh flight records',()=>void refresh()));
  root.append(element('h5','Recent flights'));
  if(!data.flights.length)root.append(element('p','No recorded flights yet. Board the helicopter and return home to start your logbook.'));
  for(const f of data.flights.slice(0,10)){
   const date=new Date(f.endedAt).toLocaleDateString();
   const route=f.routeVisited.length?f.routeVisited.map(id=>stopNames[id]||id).join(', '):'Local flight';
   const item=element('p',date+' · '+Math.floor(f.durationSeconds/60)+'m '+String(f.durationSeconds%60).padStart(2,'0')+'s · '+route);
   item.style.cssText='font-size:11px;margin:5px 0';root.append(item);
  }
  root.append(status);status.textContent='';
 }
 async function refresh(){
  if(busy)return;busy=true;
  status.textContent='Loading private hangar records…';
  try{const d=await request('?propertyId='+encodeURIComponent(propertyId));display(d);onStyle(propertyId,d.style);}
  catch(e){if(root.isConnected)status.textContent=e.message;}
  finally{busy=false;}
 }
 void refresh();
 return {root,refresh};
}
