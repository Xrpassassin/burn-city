import {buildCoveTavern} from './cove-tavern.mjs';
import {nextTavernPosition,nearSilas} from './tavern-walk.mjs';
export function canEnterTavern(ashore,pos) {
 return !!ashore&&!!pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.z)&&Math.hypot(pos.x+61,pos.z+85.5)<3;
}
export function createTavernVisit({THREE,scene,camera,game}) {
 const {room}=buildCoveTavern(THREE);scene.add(room);
 const walker=new THREE.Group();
 const coat=new THREE.MeshStandardMaterial({color:0x41566a,roughness:1});
 const skin=new THREE.MeshStandardMaterial({color:0xb88d70,roughness:1});
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.35,.8,4,8),coat);torso.position.y=1.15;walker.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.28,8,7),skin);head.position.y=1.95;walker.add(head);
 walker.position.set(0,0,-3);room.add(walker);
 const enter=document.createElement('button');enter.type='button';enter.textContent='ENTER · THE SALT LANTERN';
 enter.style.cssText='position:absolute;bottom:260px;left:50%;transform:translateX(-50%);z-index:35;padding:12px;background:#291b15;color:#ffdda4;border:1px solid #c48c50;border-radius:8px';
 enter.hidden=true;game.append(enter);
 const panel=document.createElement('section');panel.hidden=true;
 panel.style.cssText='position:absolute;bottom:14%;left:50%;transform:translateX(-50%);z-index:36;width:min(400px,92vw);padding:15px;background:#231911eb;color:#ffe6b7;border:1px solid #c48c50;border-radius:8px';
 const title=document.createElement('h2');title.textContent='The Salt Lantern · Silas Reed';
 const words=document.createElement('p');words.textContent='Silas lowers his voice: The Crown did not lose those ships. Someone wanted them forgotten.';
 const talk=document.createElement('button');talk.type='button';talk.textContent='TALK · SILAS REED';talk.hidden=true;
 talk.addEventListener('click',()=>{if(!talk.hidden)panel.hidden=false;});game.append(talk);
 const leave=document.createElement('button');leave.type='button';leave.textContent='RETURN TO HARBOR';
 leave.addEventListener('click',()=>{inside=false;room.visible=false;panel.hidden=true;talk.hidden=true;});
 panel.append(title,words,leave);game.append(panel);
 let inside=false;
 enter.addEventListener('click',()=>{if(enter.hidden)return;inside=true;room.visible=true;panel.hidden=true;walker.position.set(0,0,-3);enter.hidden=true;});
 return {update(ashore,pos,dt=0,keys=new Set()) {
   if(!ashore){inside=false;room.visible=false;panel.hidden=true;}
   enter.hidden=inside||!canEnterTavern(ashore,pos);
   if(inside){
     const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
     const side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
     const p=nextTavernPosition(walker.position,side,forward,dt);
     if(p.x!==walker.position.x||p.z!==walker.position.z){walker.rotation.y=Math.atan2(side,forward);walker.position.x=p.x;walker.position.z=p.z;}
     talk.hidden=!nearSilas(walker.position);
     const target=room.position.clone().add(walker.position).add(new THREE.Vector3(0,1.5,0));
     camera.position.lerp(target.clone().add(new THREE.Vector3(0,2.5,-4)),1-Math.pow(.001,dt));
     camera.lookAt(target);
   }
 },get inside(){return inside;}};
}
