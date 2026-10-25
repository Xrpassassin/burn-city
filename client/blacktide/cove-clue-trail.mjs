import {COVE_CLUES,nearestClue} from './cove-clues.mjs';
// In-session journal only; authoritative quest persistence remains future work.
export function createClueTrail({THREE,scene,game}) {
 const found=new Set();
 const markers=[];
 const mat=new THREE.MeshStandardMaterial({color:0xffd18a,emissive:0x9c4b10,emissiveIntensity:.4});
 for(const clue of COVE_CLUES){
   const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.32,0),mat);
   marker.position.set(clue.x,4.5,clue.z);scene.add(marker);
   markers.push({id:clue.id,marker});
 }
 const button=document.createElement('button');button.type='button';button.hidden=true;
 button.style.cssText='position:absolute;bottom:224px;left:50%;transform:translateX(-50%);z-index:29;padding:10px;background:#182433;color:#fff;border:1px solid #d6a35c;border-radius:8px';
 game.append(button);
 const journal=document.createElement('aside');journal.hidden=true;
 journal.style.cssText='position:absolute;top:12%;right:12px;z-index:29;max-width:290px;padding:14px;background:#152332ee;color:white;border:1px solid #d6a35c;border-radius:8px';
 game.append(journal);
 let nearby=null;
 button.addEventListener('click',()=>{
   if(!nearby)return;
   found.add(nearby.id);journal.hidden=false;
   journal.textContent=nearby.title+' — '+nearby.text+' ('+found.size+'/'+COVE_CLUES.length+' clues)';
   button.hidden=true;nearby=null;
   for(const item of markers)if(found.has(item.id))item.marker.visible=false;
 });
 return {update(ashore,pos){
   for(const item of markers)item.marker.visible=!!ashore&&!found.has(item.id);
   nearby=ashore?nearestClue(pos,[...found]):null;
   button.hidden=!nearby;
   if(nearby)button.textContent='INSPECT · '+nearby.title;
   if(!ashore)journal.hidden=true;
 },get found(){return [...found];}};
}
