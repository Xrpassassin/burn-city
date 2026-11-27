// Compact world-anchored Enter/Edit chip for Estates lots. Projects a door or
// facade point to the screen, fades with distance, and hides when the building
// is off-screen or behind the camera. Tap targets stay at least 40px.
export function createEstatesWorldPrompt({doc=typeof document!=='undefined'?document:null}={}){
 if(!doc?.body)return {set(){},hide(){},tick(){},dispose(){},get visible(){return false;}};
 let style=doc.getElementById('bcEstatesWorldPromptStyle');
 if(!style){
  style=doc.createElement('style');style.id='bcEstatesWorldPromptStyle';
  style.textContent=`
  #bcEstatesWorldPrompt{position:fixed;z-index:1180;display:none;transform:translate(-50%,-110%);pointer-events:none;max-width:min(220px,70vw)}
  #bcEstatesWorldPrompt .bc-estates-chip{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 5px 5px;border-radius:16px;background:#12161cf2;border:1px solid #ffc48a99;box-shadow:0 4px 14px #0007;color:#f8ead7;font:11px/1.2 system-ui,sans-serif}
  #bcEstatesWorldPrompt .bc-estates-chip-title{max-width:200px;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ffe0b8;font-weight:600;letter-spacing:.02em}
  #bcEstatesWorldPrompt .bc-estates-chip-kicker{padding:1px 7px;border-radius:999px;background:#7a2a1ce8;border:1px solid #ffb08999;color:#ffe7d4;font:700 9px/1.4 system-ui;letter-spacing:.08em;text-transform:uppercase}
  #bcEstatesWorldPrompt .bc-estates-chip-row{display:flex;gap:4px}
  #bcEstatesWorldPrompt button{pointer-events:auto;min-width:44px;min-height:40px;padding:0 11px;border:1px solid #ffb45b88;border-radius:999px;background:#2a2118;color:#fff3e3;font:700 12px system-ui;cursor:pointer}
  #bcEstatesWorldPrompt button.primary{background:#ffb45b;color:#241508;border-color:#ffe0b4}
  #bcEstatesWorldPrompt button .ico{margin-right:4px;font-size:13px}`;
  doc.head.appendChild(style);
 }
 const el=doc.createElement('div');el.id='bcEstatesWorldPrompt';el.setAttribute('role','group');el.setAttribute('aria-label','Property');
 doc.body.appendChild(el);
 let world=null,near=4,far=12,opacity=0,shown=false;
 function hide(){world=null;shown=false;el.style.display='none';el.replaceChildren();el.style.opacity='';}
 function set({x,y=1.45,z,title='',kicker='',actions=[],nearDistance=4,farDistance=12}={}){
  if(!Number.isFinite(x)||!Number.isFinite(z)){hide();return;}
  world={x,y,z};near=Math.max(.5,nearDistance);far=Math.max(near+1,farDistance);
  el.replaceChildren();
  const chip=doc.createElement('div');chip.className='bc-estates-chip';
  if(kicker){const k=doc.createElement('div');k.className='bc-estates-chip-kicker';k.textContent=kicker;chip.appendChild(k);}
  if(title){const t=doc.createElement('div');t.className='bc-estates-chip-title';t.textContent=title;chip.appendChild(t);}
  const row=doc.createElement('div');row.className='bc-estates-chip-row';
  for(const action of actions){
   const b=doc.createElement('button');if(action.primary)b.className='primary';
   b.type='button';b.setAttribute('aria-label',action.label);
   const ico=action.icon?`<span class="ico">${action.icon}</span>`:'';
   b.innerHTML=ico+action.label;
   b.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();action.run?.();});
   row.appendChild(b);
  }
  chip.appendChild(row);el.appendChild(chip);shown=true;
 }
 // project(world) should return NDC {x,y,z} in clip space (Three.js Vector3.project).
 // z>1 is behind the camera in that convention once divided; Three sets z in 0..1 in WebGL.
 function tick({camera,project,width,height,player}={}){
  if(!shown||!world){if(el.style.display!=='none')el.style.display='none';return false;}
  const w=width||doc.documentElement.clientWidth||0,h=height||doc.documentElement.clientHeight||0;
  if(w<8||h<8)return false;
  let ndc=null;
  if(typeof project==='function')ndc=project(world.x,world.y,world.z);
  else if(camera?.position&&typeof camera.project==='function'){/* unused */} 
  if(!ndc||!Number.isFinite(ndc.x)||!Number.isFinite(ndc.y)||!Number.isFinite(ndc.z)){el.style.display='none';return false;}
  // Behind the camera or far clip: hide. Three.js project() writes NDC z in ~-1..1 / 0..1.
  if(ndc.z>1||ndc.z<-1){el.style.display='none';return false;}
  if(ndc.x<-1.08||ndc.x>1.08||ndc.y<-1.12||ndc.y>1.12){el.style.display='none';return false;}
  const ref=player||camera?.position;
  const dist=ref?Math.hypot(world.x-ref.x,world.z-ref.z):near;
  const fade=dist<=near?1:dist>=far?0:1-(dist-near)/(far-near);
  if(fade<=.02){el.style.display='none';return false;}
  let sx=(ndc.x*.5+.5)*w,sy=(-ndc.y*.5+.5)*h;
  const pad=10;
  sx=Math.max(pad,Math.min(w-pad,sx));sy=Math.max(pad+10,Math.min(h-pad,sy));
  el.style.display='block';el.style.left=sx+'px';el.style.top=sy+'px';el.style.opacity=String(fade);
  opacity=fade;return true;
 }
 function dispose(){hide();el.remove();}
 return {set,hide,tick,dispose,el,get visible(){return shown&&el.style.display==='block';},get opacity(){return opacity;},get world(){return world;}};
}
