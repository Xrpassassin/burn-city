// Third-person visual-only camera wall avoidance for Homefront's authored
// interiors. The gameplay collision, character position and server movement
// are never derived from this render helper.
export function clipInteriorCamera(anchor, desired, firstHitDistance = Infinity, clearance = 0.24) {
  const a = anchor, b = desired;
  if (!a || !b || ![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite))
    throw new TypeError('finite camera positions required');
  const dx = b.x-a.x, dy = b.y-a.y, dz = b.z-a.z;
  const distance = Math.hypot(dx,dy,dz);
  if (!distance || !Number.isFinite(firstHitDistance) || firstHitDistance <= 0 ||
      firstHitDistance >= distance) return { x:b.x,y:b.y,z:b.z, occluded:false };
  // The camera must stop on the player's side even when the obstruction is
  // extremely close. Do not force an arbitrary minimum that crosses a wall.
  const padding = Number.isFinite(clearance) ? Math.max(0.05,Math.min(clearance,0.6)) : 0.24;
  const safe = firstHitDistance > padding * 2
    ? firstHitDistance - padding
    : firstHitDistance * 0.8;
  const ratio = safe / distance;
  return { x:a.x+dx*ratio, y:a.y+dy*ratio, z:a.z+dz*ratio, occluded:true };
}


/**
 * Build a tiny virtual camera volume from parallel interior wall ray origins.
 * A centre-only ray can miss a nearby door frame or edge while the lens clips
 * through it. This is presentation-only: no server collision is changed.
 *
 * The mobile mode limits this to three rays. Desktop samples vertical
 * clearance too, but each raycast still runs only at the existing 45/90ms
 * throttled cadence and only inside the active interior.
 */
export function interiorCameraProbeOrigins(anchor, desired, {
  radius = 0.18, compact = false
} = {}) {
  const a = anchor, b = desired;
  if (!a || !b || ![a.x,a.y,a.z,b.x,b.y,b.z].every(Number.isFinite))
    throw new TypeError('finite camera positions required');
  const r = Number.isFinite(radius) ? Math.max(0.05,Math.min(0.3,radius)) : 0.18;
  const dx = b.x - a.x, dz = b.z - a.z, h = Math.hypot(dx,dz);
  const lateralX = h > 1e-8 ? -dz / h : 1;
  const lateralZ = h > 1e-8 ? dx / h : 0;
  const result = [
    {x:a.x,y:a.y,z:a.z},
    {x:a.x+lateralX*r,y:a.y,z:a.z+lateralZ*r},
    {x:a.x-lateralX*r,y:a.y,z:a.z-lateralZ*r}
  ];
  if (!compact) {
    result.push({x:a.x,y:a.y+r*0.7,z:a.z});
    result.push({x:a.x,y:a.y-r*0.7,z:a.z});
  }
  return result;
}
