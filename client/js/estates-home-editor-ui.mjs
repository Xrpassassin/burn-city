import {validateHomePlacement,nextFurnitureSlot,HOME_FURNITURE_SIZE} from './estates-home-placement.mjs';
// The property owner's starter Sims-like furnishing editor: tap a furniture
// piece, tap the floor grid to position, rotate in 90° steps, preview 3D.
// Only an explicit Save calls the authenticated server (never Xaman payment).
export function mountEstateHomeEditor(container,initial,{
 api='',fetcher=fetch,storage=localStorage,onPreview=()=>{},onSaved=()=>{},onExit=()=>{}
}={}){
 if(!container?.appendChild||!initial?.ok)throw TypeError('home_editor_state_required');
 const root=document.createElement('section');
 root.dataset.estateHomeEditor=initial.propertyId;
 root.style.cssText='padding:10px 0;min-width:0;max-width:100%;box-sizing:border-box;color:#f2e9d8;font:14px/1.5 system-ui;overscroll-behavior:contain';
 root.setAttribute('aria-label','Estate home furnishing editor');
 const heading=document.createElement('h4');heading.textContent='Design your home · 0 XRP for free layouts & furniture';
 const status=document.createElement('p');status.setAttribute('role','status');
 status.style.cssText='font:12px/1.4 system-ui;color:#ebcca0';
 const help=document.createElement('p');
 help.textContent='1. Choose a floor plan. 2. Add or select furniture. 3. Tap or click the floor to place, or use arrows for fine movement. 4. Save your design.';
 help.style.cssText='font:12px/1.4 system-ui;color:#d0d6cf';
 root.append(heading,help);
 const select=(label,entries)=>{
  const wrap=document.createElement('label');wrap.textContent=label+' ';
  wrap.style.cssText='display:grid;grid-template-columns:minmax(0,1fr);gap:3px;min-width:0;width:100%;max-width:100%;flex:1 1 160px;box-sizing:border-box';
  const el=document.createElement('select');el.style.cssText='min-height:48px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;font-size:16px;border-radius:7px;background:#25363c;color:white;border:1px solid #839a91';
  for(const [value,txt,disabled]of entries){const o=document.createElement('option');o.value=value;o.textContent=txt;o.disabled=!!disabled;el.appendChild(o);}
  wrap.appendChild(el);return {wrap,el};
 };
 const row=document.createElement('div');row.style.cssText='display:flex;flex-wrap:wrap;gap:7px;margin:8px 0;min-width:0;max-width:100%;box-sizing:border-box';
 const layouts=select('Floor plan',initial.layouts.map(l=>[l.id,l.name+(l.priceXrp>0?' · '+l.priceXrp+' XRP upgrade':' · FREE')+(l.unlocked?'':' · LOCKED'),!l.unlocked]));
 const furniture=select('Furniture',initial.catalog.map(f=>[f.id,f.label+' · FREE',false]));
 row.append(layouts.wrap,furniture.wrap);root.appendChild(row);
 const canvas=document.createElement('canvas');canvas.width=360;canvas.height=300;
 canvas.style.cssText='display:block;width:100%;max-width:440px;min-width:0;box-sizing:border-box;height:auto;aspect-ratio:6/5;background:#d5c7ae;border:2px solid #9d8970;border-radius:9px;touch-action:manipulation;cursor:crosshair;outline-offset:3px';
 canvas.setAttribute('role','grid');canvas.setAttribute('tabindex','0');
 canvas.setAttribute('aria-label','Editable top-down home floor plan. Tap a piece then tap a clear space to move it. Keyboard arrows nudge, R rotates, Delete removes.');
 root.appendChild(canvas);
 const controls=document.createElement('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;max-width:440px';
 const button=(name,run)=>{const el=document.createElement('button');el.type='button';el.textContent=name;
  el.style.cssText='min-height:48px;min-width:50px;flex:1 1 auto;touch-action:manipulation;padding:9px 12px;border-radius:8px;background:#31464a;color:#f5e8d8;border:1px solid #91a69d;font:700 12px system-ui';
  el.addEventListener('click',run);controls.appendChild(el);return el;};
 let token=storage?.getItem('bcToken')||'';
 const owner=initial.editable===true&&!!token;
 const saved={layoutId:initial.layoutId,furniture:initial.furniture.map(x=>({...x}))};
 let current={layoutId:saved.layoutId,furniture:saved.furniture.map(x=>({...x}))},selected=-1,busy=false,closed=false;
 const undoStack=[];
 const takeSnapshot=()=>({layoutId:current.layoutId,furniture:current.furniture.map(x=>({...x}))});
 const remember=()=>{undoStack.push(takeSnapshot());if(undoStack.length>24)undoStack.shift();};
 const count=document.createElement('p');count.style.cssText='font:12px system-ui;color:#d8decc;margin:6px 0';
 count.setAttribute('aria-live','polite');
 const itemList=document.createElement('div');
 itemList.style.cssText='display:flex;gap:6px;max-width:440px;overflow-x:auto;padding:4px 0 9px;scroll-snap-type:x proximity';
 root.append(count,itemList);
 const alive=()=>!closed&&root.isConnected!==false;
 const dims=initial.dimensions;
 const uuid=()=>('draft-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)).slice(0,36);
 function renderGrid(){
  const ctx=canvas.getContext?.('2d');if(!ctx)return;
  const w=canvas.width,h=canvas.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#d5c7ae';ctx.fillRect(0,0,w,h);
  for(let x=0;x<=w;x+=Math.max(10,Math.round(w/(dims.halfX*4)))) {
   ctx.strokeStyle='#ad9f873b';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
  }
  for(let z=0;z<=h;z+=Math.max(10,Math.round(h/(dims.halfZ*4)))) {
   ctx.strokeStyle='#ad9f873b';ctx.beginPath();ctx.moveTo(0,z);ctx.lineTo(w,z);ctx.stroke();
  }
  ctx.strokeStyle='#675a49';ctx.lineWidth=4;ctx.strokeRect(3,3,w-6,h-6);
  ctx.fillStyle='#718f82';ctx.fillRect(w*.37,h-8,w*.26,8);
  const scaleX=w/(2*dims.halfX),scaleZ=h/(2*dims.halfZ);
  current.furniture.forEach((f,i)=>{
   const [w0,d0]=HOME_FURNITURE_SIZE[f.type]||[.5,.5],turn=f.rotation%180!==0,
    fw=(turn?d0:w0)*scaleX,fd=(turn?w0:d0)*scaleZ,
    x=(f.x+dims.halfX)*scaleX,z=(f.z+dims.halfZ)*scaleZ;
   ctx.fillStyle=i===selected?'#dc9b65':'#7e8b75';
   ctx.fillRect(x-fw/2,z-fd/2,fw,fd);ctx.strokeStyle=i===selected?'#6f3826':'#3d5046';
   ctx.lineWidth=i===selected?3:1;ctx.strokeRect(x-fw/2,z-fd/2,fw,fd);
   ctx.fillStyle='#20372f';ctx.font='11px system-ui';ctx.fillText(f.type.slice(0,8),x-fw/2+3,z+4);
  });
 }
 function refreshSelection(){
  if(selected>=current.furniture.length)selected=-1;
  itemList.replaceChildren();
  current.furniture.forEach((item,i)=>{
   const choice=document.createElement('button');choice.type='button';
   choice.textContent=(i===selected?'● ':'')+(initial.catalog.find(f=>f.id===item.type)?.label||item.type);
   choice.setAttribute('aria-pressed',String(i===selected));
   choice.style.cssText='min-height:48px;flex:0 0 auto;min-width:90px;max-width:145px;padding:7px 10px;border-radius:7px;scroll-snap-align:start;border:2px solid '+(i===selected?'#ffd397':'#7a9389')+';color:#fff4e2;background:#31484c;font:600 12px/1.3 system-ui';
   choice.addEventListener('click',()=>{if(!owner||busy)return;selected=i;renderGrid();refreshSelection();});
   choice.disabled=!owner||busy;itemList.appendChild(choice);
  });
  count.textContent=current.furniture.length+'/24 furnishings · '+(selected<0?'Select a piece to move it':'Selected '+(initial.catalog.find(f=>f.id===current.furniture[selected]?.type)?.label||current.furniture[selected]?.type)+'. Tap floor or use arrows.');
 }
 const preview=()=>{renderGrid();refreshSelection();if(alive())onPreview({tier:initial.tier,layoutId:current.layoutId,furniture:current.furniture});};
 function chooseAt(x,z){
  const index=current.furniture.findLastIndex(f=>{
   const [w,d]=HOME_FURNITURE_SIZE[f.type];return Math.abs(f.x-x)<=w/2+.25&&Math.abs(f.z-z)<=d/2+.25;
  });
  if(selected<0&&index>=0){selected=index;status.textContent='Selected '+current.furniture[index].type+'. Tap a free spot to move it.';renderGrid();refreshSelection();return;}
  if(selected<0){status.textContent='Add an item first, then choose its position.';return;}
  const list=current.furniture.map(f=>({...f}));list[selected]={...list[selected],x,z};
  if(!validateHomePlacement(list,dims)){status.textContent='That space overlaps furniture, a wall, or the front-door path.';return;}
  remember();current.furniture=list;preview();status.textContent='Position previewed · Save to keep it.';
 }
 const snap=n=>Math.round(n*2)/2;
 canvas.addEventListener('click',event=>{
  if(!owner||!alive())return;
  const rect=canvas.getBoundingClientRect?.()||{left:0,top:0,width:canvas.width,height:canvas.height};
  const x=snap(((event.clientX-rect.left)/rect.width)*2*dims.halfX-dims.halfX);
  const z=snap(((event.clientY-rect.top)/rect.height)*2*dims.halfZ-dims.halfZ);
  chooseAt(x,z);
 });
 layouts.el.value=current.layoutId;
 layouts.el.addEventListener('change',()=>{
  const choice=initial.layouts.find(x=>x.id===layouts.el.value);
  if(!choice?.unlocked){layouts.el.value=current.layoutId;status.textContent='Purchase and verify the matching Tycoon upgrade before selecting this premium plan.';return;}
  remember();current.layoutId=choice.id;preview();status.textContent='Layout previewed · Save to keep it.';
 });
 const add=button('Add furniture (free)',()=>{
  if(!owner||busy)return;
  const type=furniture.el.value||initial.catalog[0]?.id,spot=nextFurnitureSlot(type,current.furniture,dims);
  if(!spot){status.textContent='No safe space for that item. Remove or move a piece first.';return;}
  remember();spot.id=uuid();current.furniture.push(spot);selected=current.furniture.length-1;preview();
  status.textContent='Added '+type+'. Tap the grid to reposition it.';
 });
 const rotate=button('Rotate 90°',()=>{
  if(!owner||selected<0)return;
  const next=current.furniture.map(f=>({...f}));
  next[selected].rotation=(next[selected].rotation+90)%360;
  if(!validateHomePlacement(next,dims)){status.textContent='Not enough clearance to rotate here.';return;}
  remember();current.furniture=next;preview();
 });
 const remove=button('Remove selected',()=>{
  if(!owner||selected<0)return;
  remember();current.furniture.splice(selected,1);selected=-1;preview();status.textContent='Item removed from preview.';
 });
 const revert=button('Reset preview',()=>{
  remember();current={layoutId:saved.layoutId,furniture:saved.furniture.map(f=>({...f}))};
  selected=-1;layouts.el.value=current.layoutId;preview();status.textContent='Unsaved changes cleared.';
 });
 const nudge=(dx,dz)=>{
  if(!owner||busy||selected<0)return;
  const list=current.furniture.map(x=>({...x}));
  list[selected].x+=dx;list[selected].z+=dz;
  if(!validateHomePlacement(list,dims)){status.textContent='That move blocks the entry or overlaps another item.';return;}
  remember();current.furniture=list;preview();status.textContent='Moved 0.5m · Save to keep changes.';
 };
 const undo=button('↶ Undo last change',()=>{
  if(!owner||busy||undoStack.length===0)return;
  current=undoStack.pop();selected=-1;layouts.el.value=current.layoutId;preview();
  status.textContent='Previous design restored. Save when ready.';
 });
 const navButtons=document.createElement('div');
 navButtons.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(48px,1fr));gap:7px;max-width:280px;margin:12px auto;touch-action:manipulation';
 const nudgeButton=(label,x,z,column,row)=>{
  const key=document.createElement('button');key.type='button';key.textContent=label;
  key.setAttribute('aria-label',label+' selected furniture by half a meter');
  key.style.cssText='grid-column:'+column+';grid-row:'+row+';min-height:52px;padding:10px;border-radius:9px;color:white;background:#405b60;border:1px solid #a4b9ae;font:700 20px system-ui;touch-action:manipulation';
  key.addEventListener('click',()=>nudge(x,z));navButtons.appendChild(key);return key;
 };
 const up=nudgeButton('↑',0,-.5,2,1);
 const left=nudgeButton('←',-.5,0,1,2);
 const right=nudgeButton('→',.5,0,3,2);
 const down=nudgeButton('↓',0,.5,2,3);
 root.appendChild(navButtons);
 const keys={ArrowUp:[0,-.5],ArrowDown:[0,.5],ArrowLeft:[-.5,0],ArrowRight:[.5,0]};
 root.addEventListener('keydown',event=>{
  // Never propagate editor keyboard input into the game's player controls.
  event.stopPropagation?.();
  if(event.target?.tagName==='SELECT'||event.target?.tagName==='INPUT'||event.target?.tagName==='TEXTAREA')return;
  if(keys[event.key]){event.preventDefault?.();nudge(...keys[event.key]);}
  else if(event.key==='r'||event.key==='R'){event.preventDefault?.();rotate.click();}
  else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault?.();remove.click();}
  else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault?.();undo.click();}
 });
 const save=button('Save design · 0 XRP',()=>void persist());
 const close=button('Continue exploring',()=>{closed=true;onPreview(null);onExit();root.remove();});
 if(!owner){for(const b of [add,rotate,remove,revert,save,undo,up,left,right,down])b.disabled=true;layouts.el.disabled=true;furniture.el.disabled=true;
  status.textContent='Invited guests may explore but only the current owner can rearrange this home.';
 }else status.textContent='Your free furnishings are editable. Premium floor plans require the existing XRP Tycoon unlock; no extra payment is made here.';
 root.append(controls,status);container.appendChild(root);renderGrid();refreshSelection();
 async function persist(){
  if(!owner||busy||!alive())return;
  if(storage?.getItem('bcToken')!==token){status.textContent='Wallet changed. Re-enter the home to edit.';save.disabled=true;return;}
  if(!validateHomePlacement(current.furniture,dims)){status.textContent='Fix furniture overlap before saving.';return;}
  busy=true;save.disabled=true;
  try{
   const response=await fetcher(api+'/api/estates/home/state',{method:'POST',cache:'no-store',headers:{
    authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({
    propertyId:initial.propertyId,layoutId:current.layoutId,furniture:current.furniture})});
   const result=await response.json();
   if(storage?.getItem('bcToken')!==token||!alive())throw Error('Home editor session changed.');
   if(!response.ok||result.ok!==true)throw Error(result.error==='home_layout_requires_verified_upgrade'?
    'Unlock this premium layout through the verified Tycoon shop first.':result.error==='property_owner_required'?
    'Only the current property owner may save.':'Unable to save. Check room clearance or your connection.');
   saved.layoutId=result.layoutId;saved.furniture=result.furniture.map(f=>({...f}));
   current={layoutId:saved.layoutId,furniture:saved.furniture.map(f=>({...f}))};
   undoStack.length=0;refreshSelection();onSaved(result);status.textContent='Home saved to your property. No XRP charged.';
  }catch(e){if(alive())status.textContent=e.message;}
  finally{busy=false;if(alive())save.disabled=!owner||storage?.getItem('bcToken')!==token;}
 }
 return {root,dispose(){if(closed)return;closed=true;onPreview(null);root.remove();},get current(){return current;}};
}
