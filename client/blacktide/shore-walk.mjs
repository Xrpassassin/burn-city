import {walkingIntent} from '../js/walking-input.mjs';
import {createWalkingPad} from '../js/walking-pad.mjs';
// First playable Cinder Cove shore walk. Client visuals only; never grants quests/rewards.
export function createShoreWalk({THREE,scene,camera,game,ship,trade}) {
  const island={x:-56,z:-84};
  const avatar=new THREE.Group();
  const cloth=new THREE.MeshStandardMaterial({color:0x384a57,roughness:.9});
  const skin=new THREE.MeshStandardMaterial({color:0xb68b68,roughness:1});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.85,4,8),cloth);
  torso.position.y=1.3;avatar.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,10,8),skin);
  head.position.y=2.2;avatar.add(head);
  for(const x of [-.22,.22]) {
    const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.65,3,6),cloth);
    leg.position.set(x,.48,0);avatar.add(leg);
  }
  avatar.visible=false;scene.add(avatar);
  const button=document.createElement('button');
  button.type='button';button.textContent='DISEMBARK · CINDER COVE';
  button.style.cssText='position:absolute;bottom:110px;left:50%;transform:translateX(-50%);z-index:25;padding:12px 18px;border:1px solid #b98a4e;border-radius:8px;background:#17202b;color:#fff;font-weight:700;cursor:pointer';
  button.hidden=true;game.append(button);
  const pad=createWalkingPad(game,{label:'Cinder Cove movement'});
  pad.setVisible(false);
  let ashore=false,angle=0;
  const helmControls=game.querySelector?.('.mobile-controls');
  const helmDisplay=helmControls?.style.display || '';
  const syncControls=()=>{
    pad.setVisible(ashore);
    if(helmControls)helmControls.style.display=ashore?'none':helmDisplay;
  };
  button.addEventListener('click',()=>{
    ashore=!ashore;avatar.visible=ashore;
    if(ashore){avatar.position.set(island.x,2.4,island.z-7);angle=0;}
    button.textContent=ashore?'RETURN TO SHIP':'DISEMBARK · CINDER COVE';
    trade.setShoreMode(ashore);
    syncControls();
  });
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  return {
    dispose(){pad.dispose();if(helmControls)helmControls.style.display=helmDisplay;button.remove();scene.remove(avatar);},
    get ashore(){return ashore;},
    get position(){return avatar.position;},
    update(dt,keys) {
      dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
      const atCove=trade.test.state().docked==='cinder-cove';
      if(!atCove&&ashore){ashore=false;avatar.visible=false;trade.setShoreMode(false);syncControls();}
      button.hidden=!atCove;
      if(!ashore)return false;
      const {x:side,z:f,moving}=walkingIntent(keys,pad.vector);
      if(moving){
        const dx=side,dz=-f;
        avatar.position.x=clamp(avatar.position.x+dx*dt*4,island.x-7,island.x+7);
        avatar.position.z=clamp(avatar.position.z+dz*dt*4,island.z-17,island.z+10);
        angle=Math.atan2(-dx,-dz);avatar.rotation.y=angle;
      }
      const target=avatar.position.clone().add(new THREE.Vector3(0,1.4,0));
      const behind=new THREE.Vector3(Math.sin(angle)*5,3.5,Math.cos(angle)*5);
      camera.position.lerp(target.clone().add(behind),1-Math.pow(.001,dt));
      camera.lookAt(target);
      return true;
    }
  };
}
