// Pure room movement boundaries; keeps the player away from walls and the bar.
export function nextTavernPosition(pos,dx,dz,dt) {
 const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0))*2.7;
 const length=Math.hypot(dx,dz);
 if(!length)return {x:pos.x,z:pos.z};
 const x=Math.max(-3.65,Math.min(3.65,pos.x+dx/length*step));
 const z=Math.max(-3.65,Math.min(1.45,pos.z+dz/length*step));
 // Keep the two dining tables clear of the avatar's center.
 for(const cx of [-2.4,2.4]){
   if(Math.abs(x-cx)<1.15 && Math.abs(z+1)<1.15)return {x:pos.x,z:pos.z};
 }
 return {x,z};
}
export function nearSilas(pos){return !!pos&&Math.hypot(pos.x,pos.z-2.1)<2.1;}
