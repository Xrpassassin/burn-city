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
