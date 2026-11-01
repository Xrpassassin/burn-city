// Deterministic, preview-only two-segment detours for blocked destination paths.
import { roadBuildingClearance } from './homefront-road-clearance.mjs';
import { previewDestinationConnectors } from './homefront-destination-connectors.mjs';
import { reserveOrganicLandmarkClearance } from './homefront-landmark-reservations.mjs';

export function previewDestinationDetours({
  connectors = previewDestinationConnectors().connectors,
  buildings = reserveOrganicLandmarkClearance().buildings,
  margin = 0.55
} = {}) {
  if (!Number.isFinite(margin) || margin < 0) throw new RangeError('invalid detour margin');
  const routes = connectors.map(entry => {
    if (!entry.connector) return {siteId:entry.siteId,status:'no-road',segments:[]};
    const straight = entry.connector;
    const clear = segment => buildings.every(b => roadBuildingClearance(segment,b) >= margin);
    if (clear(straight)) return {siteId:entry.siteId,status:'candidate',segments:[straight]};
    const dx=straight.to.x-straight.from.x,dz=straight.to.z-straight.from.z;
    const length=Math.hypot(dx,dz);
    if (length < 0.001) return {siteId:entry.siteId,status:'blocked',segments:[]};
    const nx=-dz/length,nz=dx/length;
    // Search symmetrically in deterministic order; only accept clear segments.
    for (const fraction of [0.35,0.5,0.65]) for (const offset of [4,-4,8,-8,12,-12,16,-16]) {
      const waypoint={x:straight.from.x+dx*fraction+nx*offset,z:straight.from.z+dz*fraction+nz*offset};
      const first={from:straight.from,to:waypoint,width:straight.width};
      const second={from:waypoint,to:straight.to,width:straight.width};
      if (clear(first)&&clear(second))
        return {siteId:entry.siteId,status:'detour-candidate',segments:[first,second],waypoint};
    }
    return {siteId:entry.siteId,status:'blocked',segments:[]};
  });
  return {version:2,routes,unresolved:routes.filter(r=>r.status==='blocked'||r.status==='no-road'),
    scope:'preview-building-clearance-only'};
}
