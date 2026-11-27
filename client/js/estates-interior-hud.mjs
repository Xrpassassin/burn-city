// Compact corner cluster for walk-in Estates interiors. Replaces the large
// exit / change-room / stairs panels with 40px chips and hides outdoor chrome.
export function createEstatesInteriorHud({doc=typeof document!=='undefined'?document:null}={}){
 if(!doc?.body)return {show(){},hide(){},setContext(){},announce(){},showRoomPicker(){return false;},hidePicker(){},dispose(){},get visible(){return false;}};
 let style=doc.getElementById('bcEstatesInteriorHudStyle');
 if(!style){
  style=doc.createElement('style');style.id='bcEstatesInteriorHudStyle';
  style.textContent=`
  body.bc-estates-interior #bcEstatesDirectoryButton,
  body.bc-estates-interior #bcEstatesWalkingGuidance,
  body.bc-estates-interior #bcEstatesExit,
  body.bc-estates-interior #bcEstatePropertyHint,
  body.bc-estates-interior #gearBar{display:none!important}
  #bcEstatesInteriorHud{position:fixed;right:max(8px,env(safe-area-inset-right));bottom:calc(96px + env(safe-area-inset-bottom));z-index:1190;display:none;pointer-events:none}
  #bcEstatesInteriorHud .cluster{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
  #bcEstatesInteriorHud .announce{max-width:min(220px,70vw);padding:5px 9px;border-radius:11px;background:#12161ce8;border:1px solid #ffc48a66;color:#f3e6d2;font:600 11px/1.3 system-ui;pointer-events:none}
  #bcEstatesInteriorHud .row{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;pointer-events:auto}
  #bcEstatesInteriorHud button{min-width:40px;min-height:40px;padding:0 11px;border:1px solid #ffb45b88;border-radius:999px;background:#17151af2;color:#fff3e3;font:700 12px system-ui;cursor:pointer;box-shadow:0 3px 10px #0006}
  #bcEstatesInteriorHud button.primary{background:#ffb45b;color:#241508;border-color:#ffe0b4}
  #bcEstatesInteriorHud button[hidden]{display:none!important}
  #bcEstatesInteriorHud .picker{display:none;flex-direction:column;gap:4px;min-width:min(196px,70vw);padding:6px;border-radius:14px;background:#12161cf2;border:1px solid #ffc48a88;box-shadow:0 4px 14px #0007}
  #bcEstatesInteriorHud .picker.open{display:flex}
  #bcEstatesInteriorHud .picker button{width:100%;justify-content:center;text-align:center}`;
  doc.head.appendChild(style);
 }
 const el=doc.createElement('div');el.id='bcEstatesInteriorHud';el.setAttribute('role','toolbar');el.setAttribute('aria-label','Home controls');
 const cluster=doc.createElement('div');cluster.className='cluster';
 const announceEl=doc.createElement('div');announceEl.className='announce';announceEl.hidden=true;
 const row=doc.createElement('div');row.className='row';
 const exitBtn=doc.createElement('button');exitBtn.type='button';exitBtn.className='primary';exitBtn.textContent='Exit';
 const roomsBtn=doc.createElement('button');roomsBtn.type='button';roomsBtn.textContent='Rooms';
 const stairsBtn=doc.createElement('button');stairsBtn.type='button';stairsBtn.hidden=true;stairsBtn.textContent='Stairs';
 const extraBtn=doc.createElement('button');extraBtn.type='button';extraBtn.hidden=true;
 const picker=doc.createElement('div');picker.className='picker';picker.hidden=true;
 row.append(exitBtn,roomsBtn,stairsBtn,extraBtn);
 cluster.append(announceEl,picker,row);el.appendChild(cluster);doc.body.appendChild(el);
 let onExit=()=>{},onRooms=()=>{},onStairs=null,onExtra=null,hideTimer=0,shown=false;
 exitBtn.addEventListener('click',()=>onExit());
 roomsBtn.addEventListener('click',()=>onRooms());
 stairsBtn.addEventListener('click',()=>onStairs?.());
 extraBtn.addEventListener('click',()=>onExtra?.());
 function show({exit,rooms,label}={}){
  if(typeof exit==='function')onExit=exit;
  if(typeof rooms==='function')onRooms=rooms;
  roomsBtn.hidden=!rooms;
  if(label)exitBtn.textContent=label;
  shown=true;el.style.display='block';
  doc.body.classList.add('bc-estates-interior');
 }
 function hidePicker(){picker.hidden=true;picker.classList.remove('open');picker.replaceChildren();}
 function hide(){
  shown=false;el.style.display='none';announceEl.hidden=true;stairsBtn.hidden=true;extraBtn.hidden=true;hidePicker();
  doc.body.classList.remove('bc-estates-interior');
 }
 function showRoomPicker(rooms=[],{onPick,onClose}={}){
  hidePicker();
  const list=Array.isArray(rooms)?rooms.filter(r=>r&&r.id&&r.title):[];
  if(!list.length){announce('No other rooms are open in this home',2200);return false;}
  for(const room of list){
   const b=doc.createElement('button');b.type='button';if(room.primary)b.className='primary';
   b.textContent=room.title;b.setAttribute('aria-label',room.title);
   b.addEventListener('click',()=>{hidePicker();onPick?.(room);});
   picker.appendChild(b);
  }
  const close=doc.createElement('button');close.type='button';close.textContent='Close';
  close.addEventListener('click',()=>{hidePicker();onClose?.();});
  picker.appendChild(close);picker.hidden=false;picker.classList.add('open');return true;
 }
 function setContext({stairs=null,stairsLabel='Stairs',extra=null,extraLabel=''}={}){
  onStairs=typeof stairs==='function'?stairs:null;
  stairsBtn.hidden=!onStairs;if(onStairs)stairsBtn.textContent=stairsLabel;
  onExtra=typeof extra==='function'?extra:null;
  extraBtn.hidden=!onExtra;if(onExtra)extraBtn.textContent=extraLabel||'Use';
 }
 function announce(text,ms=3200){
  if(!text){announceEl.hidden=true;return;}
  announceEl.textContent=text;announceEl.hidden=false;
  clearTimeout(hideTimer);if(ms>0)hideTimer=setTimeout(()=>{announceEl.hidden=true;},ms);
 }
 function dispose(){clearTimeout(hideTimer);hide();el.remove();}
 return {show,hide,setContext,announce,showRoomPicker,hidePicker,dispose,el,get visible(){return shown;},get pickerOpen(){return !picker.hidden;}};
}
