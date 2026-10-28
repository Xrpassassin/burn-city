// Cosmetic road route interpolation for the city-side public beach turn-in.
// Deterministic, isolated from city traffic lights and server movement authority.
export function buildBeachAccessRoute({junction,parking,dir,side}){
 const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 if(!finite(junction)||!finite(parking)||!finite(dir)||!finite(side))return [];
 const dot=(p,v)=>p.x*v.x+p.z*v.z;
 const delta={x:parking.x-junction.x,z:parking.z-junction.z};
 const forward=dot(delta,dir),lateral=dot(delta,side);
 if(Math.abs(lateral)<8)return [];
 const point=(along,across)=>({x:junction.x+dir.x*along+side.x*across,z:junction.z+dir.z*along+side.z*across});
 // Right-angle paved entrance: enter from the road shoulder, turn into parking, then reach a bay.
 return [point(-12,0),point(-5,0),point(5,4*Math.sign(lateral)),point(7,lateral*.48),point(forward,lateral)];
}
export function followBeachRoute(route,progress){
 if(!Array.isArray(route)||route.length<2||!Number.isFinite(progress))return null;
 const lengths=[];let total=0;
 for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.hypot(b.x-a.x,b.z-a.z);if(!Number.isFinite(n))return null;lengths.push(n);total+=n}
 if(total<=0)return null;let d=Math.max(0,Math.min(1,progress))*total;
 for(let i=0;i<lengths.length;i++){const n=lengths[i],a=route[i],b=route[i+1];if(d<=n||i===lengths.length-1){const t=n?Math.max(0,Math.min(1,d/n)):0;return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z)};}d-=n}
 return null;
}

// Both lanes advance u from 0 to 1; only the rendered road position reverses.
// Compute all advances before applying them so iteration order cannot change spacing.
export function beachTrafficAdvance(car, lane, roadLength, junctionU, dt) {
 if(!Number.isFinite(roadLength)||roadLength<=0||!Number.isFinite(dt))return 0;
 let gap=1;
 for(const other of lane){
  if(other===car||other.lane!==car.lane)continue;
  gap=Math.min(gap,((other.u-car.u)%1+1)%1);
 }
 const roadU=car.lane===0?car.u:1-car.u;
 const approach=Math.abs(roadU-junctionU)*roadLength<18?.4:1;
 const following=Math.max(0,Math.min(1,(gap*roadLength-7)/13));
 const wanted=car.sp*Math.max(0,Math.min(.05,dt))*.6*Math.min(approach,following);
 return Math.max(0,Math.min(wanted,gap-7/roadLength));
}
