// Opt-in read-only City QA bridge. Never exposed without ?qa=1 on loopback.
const q=new URLSearchParams(location.search);
const host=location.hostname;
if(q.get('qa')==='1'&&['localhost','127.0.0.1','[::1]'].includes(host)){
 const started=performance.now();
 const finite=n=>Number.isFinite(n)?Math.round(n*100)/100:null;
 const sample=()=>{
  const city=window.__city;
  const renderer=window.__R;
  const canvas=renderer?.domElement||document.querySelector('canvas');
  const rect=canvas?.getBoundingClientRect();
  const camera=city?.C;
  return Object.freeze({
   version:1,experience:'city',
   phase:window.__ready?'ready':(city?'loading':'boot'),
   uptimeMs:Math.round(performance.now()-started),
   canvas:Object.freeze({present:!!canvas,width:finite(rect?.width),height:finite(rect?.height)}),
   camera:Object.freeze({present:!!camera,x:finite(camera?.position?.x),y:finite(camera?.position?.y),z:finite(camera?.position?.z)}),
   render:Object.freeze({calls:finite(renderer?.info?.render?.calls),triangles:finite(renderer?.info?.render?.triangles)}),
   interface:Object.freeze({hud:!!document.getElementById('hud'),movementButtons:!!document.getElementById('btns'),touchControls:!!document.getElementById('touch')})
  });
 };
 Object.defineProperty(window,'__BURN_QA__',{configurable:false,enumerable:false,writable:false,value:Object.freeze({version:1,status:sample,metrics:sample})});
}
