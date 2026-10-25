export const MARA_INTERACTION_RANGE = 3.5;
export function canTalkToMara(ashore, player, npc) {
  return !!ashore && !!player && !!npc && Number.isFinite(player.x) && Number.isFinite(player.z) && Math.hypot(player.x-npc.x,player.z-npc.z) <= MARA_INTERACTION_RANGE;
}

// Lightweight client-side NPC presentation; no reward or quest completion authority.
export function createMaraInteraction({THREE,scene,game}) {
  const npc = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({color:0x735238,roughness:1});
  const skin = new THREE.MeshStandardMaterial({color:0xb88968,roughness:1});
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.4,.9,4,8),coat);
  body.position.y=1.3;npc.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3,8,8),skin);
  head.position.y=2.15;npc.add(head);
  npc.position.set(-56,2.4,-87);scene.add(npc);
  const button=document.createElement('button');
  button.type='button';button.textContent='TALK TO MARA VALE';
  button.style.cssText='position:absolute;bottom:170px;left:50%;transform:translateX(-50%);z-index:30;padding:12px;background:#192332;color:white;border:1px solid #c8a06b;border-radius:8px';
  button.hidden=true;game.append(button);
  const panel=document.createElement('section');
  panel.style.cssText='position:absolute;top:15%;left:50%;transform:translateX(-50%);z-index:31;width:min(380px,90vw);padding:18px;background:#182333;color:white;border:1px solid #c8a06b;border-radius:10px';
  panel.hidden=true;
  const heading=document.createElement('h2');heading.textContent='Mara Vale · Harbormaster';
  const dialogue=document.createElement('p');dialogue.textContent='Welcome to Cinder Cove, captain. The Crown has eyes on every sail. Speak quietly, and you may find work here.';
  const mission=document.createElement('p');mission.textContent='First Landfall: Speak with the harbormaster and visit the tavern. Quest acceptance and rewards are not yet active.';
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.addEventListener('click',()=>{panel.hidden=true;});
  panel.append(heading,dialogue,mission,close);game.append(panel);
  button.addEventListener('click',()=>{if(!button.hidden)panel.hidden=false;});
  return {
    update(ashore,position){
      const nearby=canTalkToMara(ashore,position,npc.position);
      button.hidden=!nearby;
      if(!nearby)panel.hidden=true;
    },
    get open(){return !panel.hidden;}
  };
}
