// Deterministic cosmetic birds; intentionally independent of physics and XRPL.
export function planBirdFlocks({nodes=[],tier='medium',seed=1281}={}) {
 const max={low:0,medium:8,high:18}[tier]??8;
 const spots=nodes.filter(n=>n?.pos&&Number.isFinite(n.pos.x)&&Number.isFinite(n.pos.z)&&Number.isFinite(n.distR)&&n.distR>=20);
 if(!spots.length)return [];
 let state=seed>>>0;const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
 return Array.from({length:max},(_,i)=>{const n=spots[i%spots.length],theta=rand()*Math.PI*2;
  return {x:n.pos.x+Math.cos(theta)*n.distR*.5,z:n.pos.z+Math.sin(theta)*n.distR*.5,
   y:22+rand()*20,radius:6+rand()*8,speed:.11+rand()*.12,phase:rand()*Math.PI*2,
   size:.7+rand()*.45};
 });
}
