// Closed-loop walking routes for ambient harbor workers.
// Local coordinates are relative to the Cinder Cove island center.
export const HARBOR_ROUTES=Object.freeze([
 [[-4,-8],[-2,-7],[-2,-4],[-4,-5]],
 [[3,-5],[4,-3],[4,0],[2,-1]],
 [[5,2],[3,3],[3,6],[5,5]]
]);
export function samplePatrol(route,distance) {
 if(!Array.isArray(route)||route.length<2||!Number.isFinite(distance))return null;
 const segments=route.map((p,i)=>{const q=route[(i+1)%route.length];return {p,q,length:Math.hypot(q[0]-p[0],q[1]-p[1])};});
 const total=segments.reduce((n,s)=>n+s.length,0);
 if(total<=0)return null;
 let d=((distance%total)+total)%total;
 for(const s of segments){
   if(d<=s.length){const t=s.length?d/s.length:0;return {x:s.p[0]+(s.q[0]-s.p[0])*t,z:s.p[1]+(s.q[1]-s.p[1])*t,heading:Math.atan2(s.q[0]-s.p[0],s.q[1]-s.p[1])};}
   d-=s.length;
 }
 return null;
}
