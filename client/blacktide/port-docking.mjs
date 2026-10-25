// Pure port radius and safe departure position helpers.
// No exclusive berth reservations: every player may dock within the port zone.
export function portInRange(pos,port) {
 return !!pos && !!port && Number.isFinite(pos.x) && Number.isFinite(pos.z) &&
 Number.isFinite(port.x) && Number.isFinite(port.z) && Number.isFinite(port.r) &&
 port.r>0 && Math.hypot(pos.x-port.x,pos.z-port.z)<port.r;
}
export function departurePosition(port,arrival) {
 if(!portInRange(arrival,port)) return null;
 const dx=arrival.x-port.x,dz=arrival.z-port.z;
 const dist=Math.hypot(dx,dz);
 // Prefer the arrival bearing; fall back to the seaward direction toward the starter bay.
 const ux=dist>0.01?dx/dist:(-port.x||1)/Math.hypot(-port.x||1,-port.z||1);
 const uz=dist>0.01?dz/dist:(-port.z||1)/Math.hypot(-port.x||1,-port.z||1);
 return {x:port.x+ux*(port.r+8),z:port.z+uz*(port.r+8)};
}
