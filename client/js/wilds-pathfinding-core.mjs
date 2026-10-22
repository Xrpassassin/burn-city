// Isolated grid pathfinder for CinderWilds NPC prototyping. Not wired into live movement.
const key=(x,z)=>x+','+z;
export function findGridPath({start,goal,bounds,isBlocked=()=>false,maxVisited=12000}={}) {
  if(!start||!goal||!bounds||typeof isBlocked!=='function') return null;
  const inside=(x,z)=>x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ;
  const ok=(x,z)=>inside(x,z)&&!isBlocked(x,z);
  const sx=Math.round(start.x),sz=Math.round(start.z),gx=Math.round(goal.x),gz=Math.round(goal.z);
  if(![sx,sz,gx,gz,bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)) return null;
  if(!Number.isInteger(maxVisited)||maxVisited<1) return null;
  if(!ok(sx,sz)||!ok(gx,gz)) return {path:[],visited:0,reached:false};
  const q=[{x:sx,z:sz}],prev=new Map([[key(sx,sz),null]]); let head=0;
  while(head<q.length&&head<maxVisited) {
    const p=q[head++],k=key(p.x,p.z);
    if(p.x===gx&&p.z===gz) {
      const path=[];let at=k;
      while(at!==null){const i=at.indexOf(',');path.push({x:Number(at.slice(0,i)),z:Number(at.slice(i+1))});at=prev.get(at);}
      path.reverse();return {path,visited:head,reached:true};
    }
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x=p.x+dx,z=p.z+dz,n=key(x,z);
      if(prev.has(n)||!ok(x,z)) continue;
      prev.set(n,k);q.push({x,z});
    }
  }
  return {path:[],visited:head,reached:false};
}
