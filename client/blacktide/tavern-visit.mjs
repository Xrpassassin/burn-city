import {buildCoveTavern} from './cove-tavern.mjs';
export function canEnterTavern(ashore,pos) {
 return !!ashore&&!!pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.z)&&Math.hypot(pos.x+61,pos.z+85.5)<3;
}
export function createTavernVisit({THREE,scene,camera,game}) {
 const {room}=buildCoveTavern(THREE);scene.add(room);
 const enter=document.createElement('button');enter.type='button';enter.textContent='ENTER · THE SALT LANTERN';
 enter.style.cssText='position:absolute;bottom:260px;left:50%;transform:translateX(-50%);z-index:35;padding:12px;background:#291b15;color:#ffdda4;border:1px solid #c48c50;border-radius:8px';
 enter.hidden=true;game.append(enter);
 const panel=document.createElement('section');panel.hidden=true;
 panel.style.cssText='position:absolute;bottom:14%;left:50%;transform:translateX(-50%);z-index:36;width:min(400px,92vw);padding:15px;background:#231911eb;color:#ffe6b7;border:1px solid #c48c50;border-radius:8px';
 const title=document.createElement('h2');title.textContent='The Salt Lantern · Silas Reed';
 const words=document.createElement('p');words.textContent='Silas lowers his voice: The Crown did not lose those ships. Someone wanted them forgotten.';
 const leave=document.createElement('button');leave.type='button';leave.textContent='RETURN TO HARBOR';
 leave.addEventListener('click',()=>{inside=false;room.visible=false;panel.hidden=true;});
 panel.append(title,words,leave);game.append(panel);
 let inside=false;
 enter.addEventListener('click',()=>{if(enter.hidden)return;inside=true;room.visible=true;panel.hidden=false;enter.hidden=true;});
 return {update(ashore,pos){
   if(!ashore){inside=false;room.visible=false;panel.hidden=true;}
   enter.hidden=inside||!canEnterTavern(ashore,pos);
   if(inside){camera.position.set(500,4.4,496);camera.lookAt(500,3.5,502);}
 },get inside(){return inside;}};
}
