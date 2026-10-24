// Walkable-world navigation and proximity interactions for Estates Island.
// Pure geometry: the host supplies world position + desired movement and applies the result
// to its character/camera. No auth, ownership, networking, or physics engine is implied.
const finite = n => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function validPoint(p, label='position') {
  if (!p || !finite(p.x) || !finite(p.y) || !finite(p.z)) {
    throw new TypeError(label + ' must contain finite x/y/z');
  }
}
function insideEllipse(x, z, rx, rz) {
  return (x*x)/(rx*rx) + (z*z)/(rz*rz) <= 1;
}
function circleRectOverlap(x, z, radius, rect) {
  const nx=clamp(x,rect.x-rect.halfW,rect.x+rect.halfW);
  const nz=clamp(z,rect.z-rect.halfD,rect.z+rect.halfD);
  const dx=x-nx,dz=z-nz;
  return dx*dx+dz*dz < radius*radius;
}

export function createEstatesIslandNavigation({manifest, playerRadius=0.65, collisionPadding=0.15}={}) {
  if (!manifest || !Array.isArray(manifest.lots) || !Array.isArray(manifest.vegetation) || !manifest.bounds) {
    throw new TypeError('Estates Island scene manifest is required');
  }
  if (!finite(playerRadius) || playerRadius<=0) throw new TypeError('playerRadius must be positive');
  if (!finite(collisionPadding) || collisionPadding<0) throw new TypeError('collisionPadding must be non-negative');

  const radius=playerRadius+collisionPadding;
  const ground=manifest.terrain.find(item=>item.id==='island-ground');
  if(!ground) throw new TypeError('Island ground descriptor is required');
  const rx=ground.dimensions.width/2-radius-0.5;
  const rz=ground.dimensions.depth/2-radius-0.5;
  const buildings=manifest.lots.filter(l=>l.buildingFootprint).map(l=>({
    id:l.id, propertyId:l.propertyId, address:l.address, tier:l.tier,
    x:l.position.x,z:l.position.z,
    halfW:l.buildingFootprint.width/2+radius,
    halfD:l.buildingFootprint.depth/2+radius
  }));
  const trees=manifest.vegetation.map(t=>({
    id:t.id,x:t.position.x,z:t.position.z,
    r:Math.max(t.dimensions.width,t.dimensions.depth)*0.28+radius
  }));

  function onWalkableLand(x,z) {
    if (insideEllipse(x,z,rx,rz)) return true;
    // Keep the two designed bridge corridors walkable while blocking the lake ring.
    const primary=Math.abs(x)<=6.2 && z>=128 && z<=188;
    const service=Math.abs(x+91)<=3.9 && z>=91 && z<=135;
    // Public cross-city bridge joins the island's north approach to the city-side gate.
    const cityBridge=x>=-220 && x<=0 && z>=183 && z<=193;
    return primary || service || cityBridge;
  }
  function collides(x,z) {
    for (const b of buildings) {
      if (Math.abs(x-b.x)<b.halfW && Math.abs(z-b.z)<b.halfD) return true;
    }
    for (const t of trees) {
      const dx=x-t.x,dz=z-t.z;
      if (dx*dx+dz*dz<t.r*t.r) return true;
    }
    return false;
  }
  function isBlocked(x,z) { return !onWalkableLand(x,z) || collides(x,z); }

  function move(position, delta) {
    validPoint(position,'position'); validPoint(delta,'delta');
    const distance=Math.hypot(delta.x,delta.z);
    const steps=Math.max(1,Math.ceil(distance/Math.max(0.25,playerRadius*0.6)));
    const sx=delta.x/steps, sz=delta.z/steps;
    let x=position.x,z=position.z, blockedX=false,blockedZ=false;
    for(let i=0;i<steps;i++) {
      const tx=x+sx,tz=z+sz;
      if(!isBlocked(tx,z)) x=tx; else blockedX=true;
      if(!isBlocked(x,tz)) z=tz; else blockedZ=true;
    }
    // Invalid/outside spawn points cannot be moved deeper into blocked terrain.
    if(isBlocked(x,z) && !isBlocked(position.x,position.z)) { x=position.x; z=position.z; }
    return Object.freeze({position:Object.freeze({x,y:finite(position.y)?position.y:0,z}),blockedX,blockedZ,moved:Math.hypot(x-position.x,z-position.z)>1e-6});
  }

  function nearbyProperty(position, interactionRadius=8) {
    validPoint(position);
    if(!finite(interactionRadius)||interactionRadius<=0) throw new TypeError('interactionRadius must be positive');
    let best=null,bestD=interactionRadius;
    for(const lot of manifest.lots) {
      const d=Math.hypot(position.x-lot.position.x,position.z-lot.position.z);
      if(d<=bestD){best=lot;bestD=d;}
    }
    if(!best)return null;
    return Object.freeze({
      lotId:best.id,propertyId:best.propertyId??null,address:best.address,
      tier:best.tier,assigned:Boolean(best.propertyId),distance:bestD,
      interaction:'inspect-property'
    });
  }

  function isWalkable(position) {
    validPoint(position);
    return onWalkableLand(position.x,position.z)&&!collides(position.x,position.z);
  }

  return Object.freeze({
    move, nearbyProperty, isWalkable,
    get collisionCount(){return buildings.length+trees.length;},
    get buildingColliderCount(){return buildings.length;},
    get treeColliderCount(){return trees.length;}
  });
}
