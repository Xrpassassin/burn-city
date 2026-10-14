// Low-poly quadcopter: shared merged geometry (used for my fly-mode drone and instanced for other visitors) + Race drone mode.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const B=(w,h,d,x,y,z,ry=0)=>{const g=new THREE.BoxGeometry(w,h,d);if(ry)g.rotateY(ry);return g.translate(x,y,z)};
let _body=null,_rot=null;
export function droneGeo(){if(_body)return {body:_body,rot:_rot};
  const arms=[];for(const a of [Math.PI/4,-Math.PI/4])arms.push(B(3.2,.14,.22,0,0,0,a));
  const motors=[];for(const [x,z] of [[1.1,1.1],[-1.1,1.1],[1.1,-1.1],[-1.1,-1.1]]){motors.push(new THREE.CylinderGeometry(.16,.16,.25,6).translate(x,.1,z))}
  _body=mergeGeometries([B(.9,.32,1.2,0,0,0),B(.5,.18,.3,0,-.05,.7),...arms,...motors].map(g=>g.index?g.toNonIndexed():g));
  _rot=mergeGeometries([[1.1,1.1],[-1.1,1.1],[1.1,-1.1],[-1.1,-1.1]].map(([x,z])=>B(1.3,.03,.12,x,.25,z)));return {body:_body,rot:_rot}}
// my own drone (fly mode): chase-cam style, sits ahead of and below the camera
export function initDrone(c,{color=0x3cf3ff,keys,tb,MOBILE}={}){
  const g=droneGeo(),grp=new THREE.Group(),body=new THREE.Mesh(g.body,new THREE.MeshStandardMaterial({color:0x1a1f2b,metalness:.7,roughness:.35,emissive:0x0a0c12}));
  const rots=[];[[1.1,1.1],[-1.1,1.1],[1.1,-1.1],[-1.1,-1.1]].forEach(([x,z],i)=>{const r=new THREE.Mesh(new THREE.BoxGeometry(1.3,.03,.12),new THREE.MeshBasicMaterial({color:0x99a,transparent:true,opacity:.55}));r.position.set(x,.25,z);rots.push(r)});
  const glow=new THREE.Mesh(new THREE.CircleGeometry(1.6,16),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));glow.rotation.x=-Math.PI/2;glow.position.y=-.25;
  const led=new THREE.PointLight(color,MOBILE?0:6,10,2);led.position.y=-.6;
  const tilt=new THREE.Group();tilt.add(body,...rots,glow);if(!MOBILE)tilt.add(led);grp.add(tilt);tilt.visible=false;/* own drone hidden: clear first-person view; others still see a drone */grp.visible=false;c.S.add(grp);
  // speed trail: ring buffer of points
  const TN=48,tp=new Float32Array(TN*3),tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(tp,3));
  const trail=new THREE.Points(tg,new THREE.PointsMaterial({color,size:.9,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false}));trail.frustumCulled=false;trail.visible=false;c.S.add(trail);
  const st={race:false,boost:false,yaw0:null,bank:0,pitch:0,ti:0,grp};
  // race toggle + boost button (shown in fly mode only)
  const bar=document.createElement('div');bar.id='droneBar';bar.innerHTML='<button id="dRace">🏁 Race drone</button><button id="dBoost">⚡ Boost</button>';document.body.append(bar);
  const css=document.createElement('style');css.textContent='#droneBar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom));display:none;gap:8px;z-index:30}#droneBar button{font:600 13px system-ui;padding:9px 14px;border-radius:12px;border:1px solid #ffffff30;background:#0b1020cc;color:#fff;backdrop-filter:blur(6px)}#droneBar button.on{background:#ff7a1acc;border-color:#ffb36a}#droneBar #dBoost{display:none}#droneBar.race #dBoost{display:inline-block}';document.head.append(css);
  const bR=bar.querySelector('#dRace'),bB=bar.querySelector('#dBoost');
  bR.onclick=e=>{e.stopPropagation();st.race=!st.race;bR.classList.toggle('on',st.race);bar.classList.toggle('race',st.race);trail.visible=st.race};
  const bon=e=>{e.preventDefault();e.stopPropagation();st.boost=true;bB.classList.add('on')},boff=()=>{st.boost=false;bB.classList.remove('on')};
  bB.addEventListener('pointerdown',bon);bB.addEventListener('pointerup',boff);bB.addEventListener('pointerleave',boff);
  addEventListener('keydown',e=>{if(e.code==='KeyR'&&grp.visible&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName))bR.onclick(e)});
  const fwd=new THREE.Vector3(),baseFov=c.C.fov;
  st.show=v=>{grp.visible=v;bar.style.display=v?'flex':'none';trail.visible=v&&st.race;if(!v&&c.C.fov!==baseFov){c.C.fov=baseFov;c.C.updateProjectionMatrix()}};
  st.speedMul=()=>st.race?3*((st.boost||keys.KeyF||keys.ShiftRight)?1.8:1):1;
  // called after camera moved: dir = look dir, f/s = stick input, colliders for push-out
  st.update=(dt,t,dir,f,s,colliders)=>{const C=c.C;
    if(st.race&&colliders){for(const k of colliders){if(!k.r)continue;const top=k.node?k.node.h+2:k.h*2+1;if(C.position.y>top)continue;const dx=C.position.x-k.x,dz=C.position.z-k.z,d=Math.hypot(dx,dz),m=k.r+4;if(d<m&&d>1e-3){C.position.x=k.x+dx/d*m;C.position.z=k.z+dz/d*m}}}
    fwd.set(dir.x,0,dir.z).normalize();const yaw=Math.atan2(fwd.x,fwd.z);let dy=st.yaw0==null?0:yaw-st.yaw0;dy=Math.atan2(Math.sin(dy),Math.cos(dy));st.yaw0=yaw;
    const turn=dy/Math.max(dt,1e-3)+s*.8,amp=st.race?1:.4;st.bank+=(THREE.MathUtils.clamp(-turn*.18,-.7,.7)*amp-st.bank)*Math.min(1,dt*6);st.pitch+=(f*.3*amp-st.pitch)*Math.min(1,dt*5);
    grp.position.copy(C.position).addScaledVector(fwd,7).y-=2.2;grp.rotation.set(0,yaw,0);tilt.rotation.set(st.pitch,0,st.bank);
    const sp=st.race?(st.boost||keys.KeyF?40:26):12;rots.forEach((r,i)=>r.rotation.y=t*sp*(i%2?1:-1));glow.material.opacity=.4+.15*Math.sin(t*4);
    const fast=st.race&&Math.abs(f)>.2,tf=baseFov+(fast?(st.boost||keys.KeyF?18:10):0);if(Math.abs(C.fov-tf)>.05){C.fov+=(tf-C.fov)*Math.min(1,dt*4);C.updateProjectionMatrix()}
    if(trail.visible){const i=(st.ti++%TN)*3;tp[i]=C.position.x-fwd.x*2;tp[i+1]=C.position.y-3.2;tp[i+2]=C.position.z-fwd.z*2;tg.attributes.position.needsUpdate=true;trail.material.opacity=fast?.75:.25}};
  st.setColor=c=>{glow.material.color.set(c);led.color.set(c);trail.material.color.set(c)};st.skin=id=>{const on=id==='drone_burncoin';body.material.color.set(on?0xd89a1e:0x1a1f2b);body.material.emissive.set(on?0xff5a00:0x0a0c12);body.material.emissiveIntensity=on?.55:1;body.material.metalness=on?.9:.7;body.material.roughness=on?.25:.35;if(on)st.setColor(0xffb020);else if(window.__myColor!=null)st.setColor(window.__myColor)};st.skin(localStorage.bcDroneSkin||'');addEventListener('bc-skin',()=>st.skin(localStorage.bcDroneSkin||''));if(window.__myColor!=null)st.setColor(window.__myColor);addEventListener('bc-mycolor',e=>st.setColor(e.detail));
  return st}
