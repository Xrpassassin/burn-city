// Reuses the surrounding Three.js gameplay view. No nested browser/iframe,
// independent authority, or click-to-move. The server owns steering distance,
// collision, vehicle ownership, charge, and shared visibility.
export function createRoverControls({
 host, getSnapshot, visible=()=>true, send, onSnapshot, onError=()=>{}
}={}){
 if(!host||typeof getSnapshot!=='function'||typeof send!=='function'||typeof onSnapshot!=='function')
   throw TypeError('Rover controls require host, snapshot and server transport');
 const held=new Set();
 let busy=false,sequence=0,activeId=null;
 const pad=document.createElement('div');
 pad.className='hf-rover-pad';
 pad.hidden=true;
 pad.setAttribute('aria-label','Rover steering');
 pad.style.cssText='position:absolute;bottom:18px;right:12px;z-index:8;display:none;grid-template-columns:repeat(3,48px);gap:4px;touch-action:none';
 const positions=[['KeyW','▲',2],['KeyA','◀',3],['KeyS','▼',4],['KeyD','▶',5]];
 for(const [code,label,slot]of positions){
  const button=document.createElement('button');
  button.type='button';button.textContent=label;button.setAttribute('aria-label','Rover '+code);
  button.style.cssText='height:46px;border-radius:10px;background:#1a1b17e8;color:#ebdec6;border:1px solid #806b55;font:700 20px system-ui;touch-action:none;user-select:none';
  button.style.gridColumn=String(slot===2?2:slot===3?1:slot===4?2:3);
  button.style.gridRow=slot===2?'1':'2';
  const cancel=()=>held.delete(code);
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();event.stopPropagation();
    held.add(code);button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener('pointerup',cancel);button.addEventListener('pointercancel',cancel);button.addEventListener('lostpointercapture',cancel);
  pad.appendChild(button);
 }
 host.appendChild(pad);
 const control=(event,down)=>{
  const code=event.code;
  if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(code))return;
  const id=getSnapshot()?.selfVehicle?.id;
  if(!id||!visible())return;
  if(event.target?.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName||''))return;
  event.preventDefault();
  const key=({ArrowUp:'KeyW',ArrowDown:'KeyS',ArrowLeft:'KeyA',ArrowRight:'KeyD'})[code]||code;
  if(down)held.add(key);else held.delete(key);
 };
 window.addEventListener('keydown',event=>control(event,true),{capture:true});
 window.addEventListener('keyup',event=>control(event,false),{capture:true});
 window.addEventListener('blur',()=>held.clear());
 function sync(){
  const snap=getSnapshot(),id=snap?.selfVehicle?.id||null;
  if(id!==activeId){activeId=id;sequence=Number.isSafeInteger(snap?.selfVehicle?.sequence)?snap.selfVehicle.sequence+1:0;held.clear();}
  pad.hidden=!id||!visible();
  pad.style.display=id&&visible()?'grid':'none';
  if(!id)return;
 }
 async function tick(){
  sync();
  const snap=getSnapshot(),id=snap?.selfVehicle?.id;
  if(!id||busy||!visible()||document.hidden)return;
  const throttle=Number(held.has('KeyW'))-Number(held.has('KeyS'));
  const steer=Number(held.has('KeyD'))-Number(held.has('KeyA'));
  if(!throttle&&!steer)return;
  busy=true;
  try{
   const response=await send('drive',{sequence:sequence,throttle,steer});
   if(!response?.vehicle||response.vehicle.id!==id)throw Error('vehicle_response_mismatch');
   sequence=response.vehicle.sequence+1;
   onSnapshot(response);
   if(response.vehicleResult?.blocked)onError('Obstacle ahead. Find a wider route.');
  }catch(error){
   onError(String(error?.message||error));
   if(['invalid_vehicle_input','not_driving_vehicle','homefront_vehicles_unavailable'].includes(String(error?.message)))
    {activeId=null;held.clear();}
  }finally{busy=false;}
 }
 const clock=setInterval(tick,165);
 sync();
 return {sync,stop(){clearInterval(clock);held.clear();pad.remove();}};
}
