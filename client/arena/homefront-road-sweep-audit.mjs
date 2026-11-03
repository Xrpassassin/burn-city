// Conservative preview-only footprint sweep. Does not activate v2 or write world state.
// Tests road travel center and edges against rotated building footprints, at fixed intervals.
export function auditHomefrontRoadSweeps({ roads, buildings, sampleStep = 0.75, playerRadius = 0.45, margin = 0.3 } = {}) {
  if (!Array.isArray(roads) || !Array.isArray(buildings)) throw new TypeError('roads and buildings must be arrays');
  if (![sampleStep,playerRadius,margin].every(Number.isFinite) || sampleStep <= 0 || playerRadius < 0 || margin < 0)
    throw new RangeError('invalid sweep parameters');
  const conflicts = [];
  let samples = 0;
  for (const road of roads) {
    const dx=road.to.x-road.from.x, dz=road.to.z-road.from.z;
    const length=Math.hypot(dx,dz);
    if (!Number.isFinite(length) || !Number.isFinite(road.width) || length <= 0 || road.width <= 0)
      throw new TypeError('invalid road segment');
    const nx=-dz/length, nz=dx/length;
    const offset=Math.max(0,road.width/2-playerRadius);
    let hit=null;
    for(let i=0,n=Math.ceil(length/sampleStep);i<=n && !hit;i++) {
      const t=i/n, px=road.from.x+dx*t,pz=road.from.z+dz*t;
      for(const lateral of [-offset,0,offset]) {
        const x=px+nx*lateral,z=pz+nz*lateral;
        samples++;
        for(const building of buildings) {
          if(![building.x,building.z,building.w,building.d].every(Number.isFinite) ||
            building.w<=0 || building.d<=0) throw new TypeError('invalid building');
          const theta=Number.isFinite(building.rotation)?building.rotation:0;
          const rx=x-building.x,rz=z-building.z;
          const lx=rx*Math.cos(theta)-rz*Math.sin(theta);
          const lz=rx*Math.sin(theta)+rz*Math.cos(theta);
          const ex=Math.max(Math.abs(lx)-building.w/2,0),ez=Math.max(Math.abs(lz)-building.d/2,0);
          if(Math.hypot(ex,ez)<playerRadius+margin) {
            hit={roadId:road.id,buildingId:building.id,t:Number(t.toFixed(4)),lateral:Number(lateral.toFixed(3))};
            break;
          }
        }
        if(hit)break;
      }
    }
    if(hit)conflicts.push(hit);
  }
  return { roadCount:roads.length, buildingCount:buildings.length, samples, conflicts,
    clear:conflicts.length===0, previewOnly:true, scope:'sampled-footprint-only-not-server-navigation' };
}
