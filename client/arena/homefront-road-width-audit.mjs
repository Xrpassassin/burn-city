// Preview-only full-width road elevation sampler; no live movement authorization.
import { terrainHeight } from './homefront-terrain-generation.mjs';
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';

export function auditOrganicRoadWidth({ roads = homefrontRoadNetworkPreview().roads,
  sampleStep = 2, maxCrossSlope = 0.35, maxLongitudinalGrade = 0.35 } = {}) {
  if (![sampleStep,maxCrossSlope,maxLongitudinalGrade].every(Number.isFinite) ||
    sampleStep <= 0 || maxCrossSlope < 0 || maxLongitudinalGrade < 0)
    throw new RangeError('invalid road width audit parameters');
  const flagged = [];
  let samples = 0;
  for (const road of roads) {
    const dx = road.to.x-road.from.x, dz = road.to.z-road.from.z;
    const length = Math.hypot(dx,dz);
    if (!(length>0) || !(road.width>0)) { flagged.push({roadId:road.id,reason:'invalid-segment'}); continue; }
    const nx = -dz/length, nz = dx/length;
    const steps = Math.ceil(length/sampleStep);
    let maxCross = 0, maxLong = 0, previous = null;
    for (let i=0;i<=steps;i++) {
      const t=i/steps, x=road.from.x+dx*t, z=road.from.z+dz*t;
      const heights=[-0.5,0,0.5].map(edge=>terrainHeight(x+nx*edge*road.width,z+nz*edge*road.width));
      samples+=3;
      maxCross=Math.max(maxCross,Math.abs(heights[0]-heights[2])/road.width);
      if (previous) for(let j=0;j<3;j++)
        maxLong=Math.max(maxLong,Math.abs(heights[j]-previous[j])/(length/steps));
      previous=heights;
    }
    if(maxCross>maxCrossSlope || maxLong>maxLongitudinalGrade)
      flagged.push({roadId:road.id,reason:'slope',crossSlope:Number(maxCross.toFixed(3)),
        longitudinalGrade:Number(maxLong.toFixed(3))});
  }
  return {roadCount:roads.length,samples,flagged,acceptable:flagged.length===0};
}
