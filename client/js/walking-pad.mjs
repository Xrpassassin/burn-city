// Reusable on-foot touch D-pad. Rendering, physics and avatar choice remain scene-owned.
export function createWalkingPad({parent,visible=false}={}){
 if(!parent?.append)throw new TypeError('A parent element is required');
 const root=document.createElement('div');root.className='bc-walking-pad';
 root.style.cssText='position:absolute;left:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:37;display:grid;grid-template-columns:repeat(3,48px);gap:5px;touch-action:none;user-select:none';
 const held=new Set();const active=new Map();
 for(const [label,key,column,row] of [['▲','w',2,1],['◀','a',1,2],['▼','s',2,2],['▶','d',3,2]]){
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.setAttribute('aria-label','Move '+key);
  button.style.cssText='grid-column:'+column+';grid-row:'+row+';width:48px;height:48px;background:#34251ddf;color:white;border:1px solid #d9a05a;border-radius:8px;touch-action:none';
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);active.set(e.pointerId,key);held.add(key);});
  const release=e=>{active.delete(e.pointerId);if(![...active.values()].includes(key))held.delete(key);};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  root.append(button);
 }
 root.hidden=!visible;parent.append(root);
 const clear=()=>{active.clear();held.clear();};
 return {element:root,keys:held,setVisible(v){root.hidden=!v;if(!v)clear();},clear,destroy(){clear();root.remove();}};
}
