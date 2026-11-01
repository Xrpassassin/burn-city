// Preview-only deterministic migration proposals. Never writes player state.
// Candidate locations require separate authoritative terrain and navigation approval.
import { auditHomefrontSavedPositions } from './homefront-saved-position-audit.mjs';

const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const safe = (point, buildings, radius, clearance) =>
  finitePoint(point) && auditHomefrontSavedPositions({
    positions:[point], buildings, playerRadius:radius, clearance
  }).clear;

export function planHomefrontPositionMigration({
  positions, buildings, safeAnchors = [], worldLimit = 95,
  playerRadius = 0.45, clearance = 0.3, step = 2, rings = 12
} = {}) {
  if (!Array.isArray(positions) || !Array.isArray(buildings) || !Array.isArray(safeAnchors))
    throw new TypeError('positions, buildings and safeAnchors must be arrays');
  if (![worldLimit,step].every(v=>Number.isFinite(v)&&v>0) ||
      !Number.isSafeInteger(rings)||rings<0 ||
      ![playerRadius,clearance].every(v=>Number.isFinite(v)&&v>=0))
    throw new RangeError('invalid migration parameters');
  const within = p => finitePoint(p) && Math.abs(p.x)<=worldLimit && Math.abs(p.z)<=worldLimit;
  const valid = p => within(p) && safe(p,buildings,playerRadius,clearance);
  const candidates = [];
  for (const anchor of safeAnchors) if(valid(anchor)) candidates.push({x:anchor.x,z:anchor.z,source:'approved-anchor'});
  const proposals = positions.map((p,index)=>{
    const id=p?.id??null;
    if (valid(p)) return {index,id,status:'retain',from:{x:p.x,z:p.z},to:{x:p.x,z:p.z}};
    const from=finitePoint(p)?{x:p.x,z:p.z}:null;
    const search=[];
    if (from) {
      for(let ring=1;ring<=rings;ring++) {
        // Fixed clockwise perimeter order for repeatable tie-breaking.
        for(let dx=-ring;dx<=ring;dx++) for(let dz=-ring;dz<=ring;dz++) {
          if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
          const point={x:from.x+dx*step,z:from.z+dz*step};
          if(valid(point))search.push({point,distance:Math.hypot(point.x-from.x,point.z-from.z)});
        }
        if(search.length)break;
      }
    }
    search.sort((a,b)=>a.distance-b.distance||a.point.x-b.point.x||a.point.z-b.point.z);
    const picked=search[0]?.point ?? candidates[0] ?? null;
    return {index,id,status:picked?'relocate-candidate':'blocked-manual-review',
      from,to:picked?{x:picked.x,z:picked.z}:null,
      reason:from?'outside-bounds-or-obstructed':'invalid-saved-position'};
  });
  return {version:2,previewOnly:true,requiresServerApproval:true,proposals,
    retained:proposals.filter(p=>p.status==='retain').length,
    relocatedCandidates:proposals.filter(p=>p.status==='relocate-candidate').length,
    blocked:proposals.filter(p=>p.status==='blocked-manual-review').length,
    caveat:'geometry-only; terrain, multiplayer occupancy and server navigation are not validated'};
}
