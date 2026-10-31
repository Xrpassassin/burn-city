// Reusable pointer-driven walking pad. Host owns visibility and disposal.
export function createWalkingPad(host, {label='Move', radius=54}={}) {
  const pad=document.createElement('div');
  const supportsTouch=typeof window.matchMedia==='function' && window.matchMedia('(pointer: coarse)').matches;
  pad.setAttribute('role','group');pad.setAttribute('aria-label',label);
  pad.style.cssText='position:absolute;left:18px;bottom:22px;width:116px;height:116px;border-radius:50%;border:2px solid #ffffff66;background:#0c1826a8;z-index:28;touch-action:none;user-select:none;';
  const thumb=document.createElement('div');
  thumb.style.cssText='position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px;border-radius:50%;background:#e0b477bb;border:2px solid #fff9;pointer-events:none;';
  pad.append(thumb);host.append(pad);
  pad.hidden=true;pad.style.display='none';
  let active=null,x=0,z=0;
  const reset=()=>{active=null;x=0;z=0;thumb.style.transform='translate(0px,0px)';};
  const move=e=>{
    const r=pad.getBoundingClientRect();
    const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    const d=Math.hypot(dx,dy),scale=d>radius?radius/d:1;
    x=dx*scale/radius;z=-dy*scale/radius;
    thumb.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;
  };
  // A camera finger may already be the primary touch. Ownership of this pad,
  // rather than global primary-pointer status, determines who can move it.
  const down=e=>{if(active!==null || (e.pointerType==='mouse' && e.button!==0))return;active=e.pointerId;try{pad.setPointerCapture?.(active);}catch{}move(e);e.preventDefault();};
  const drag=e=>{if(e.pointerId===active){move(e);e.preventDefault();}};
  const up=e=>{if(e.pointerId===active)reset();};
  const hidden=()=>{if(document.hidden)reset();};
  const blur=()=>reset();
  pad.addEventListener('pointerdown',down);
  pad.addEventListener('pointermove',drag);
  pad.addEventListener('pointerup',up);
  pad.addEventListener('pointercancel',up);
  pad.addEventListener('lostpointercapture',up);
  document.addEventListener('visibilitychange',hidden);
  window.addEventListener('blur',blur);
  return {
    get vector(){return {x,z};},
    reset,
    setVisible(visible){const show=!!visible && supportsTouch;pad.hidden=!show;pad.style.display=show?'':'none';if(!show)reset();},
    dispose(){reset();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',blur);pad.remove();}
  };
}
