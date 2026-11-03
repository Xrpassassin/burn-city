// Preview-only terrain slope sampler for v2 proposed roads.
// Uses the existing terrain height field as a conservative diagnostic;
// it does NOT certify server collision, road grade, or final v2 terrain.
import { terrainHeight } from './homefront-terrain-generation.mjs';
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';

export function auditOrganicRoadGrades({ roads = homefrontRoadNetworkPreview().roads,
  sampleStep = 2, maxRisePerUnit = 0.35 } = {}) {
  if (!Number.isFinite(sampleStep) || sampleStep <= 0 ||
    !Number.isFinite(maxRisePerUnit) || maxRisePerUnit < 0) throw new RangeError('invalid terrain audit parameters');
  const flagged = [];
  let samples = 0;
  for (const road of roads) {
    const length = Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z);
    if (length <= 0) { flagged.push({ roadId: road.id, reason: 'zero-length' }); continue; }
    const steps = Math.ceil(length / sampleStep);
    let previous = terrainHeight(road.from.x, road.from.z);
    let maxGrade = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const y = terrainHeight(road.from.x + (road.to.x - road.from.x) * t,
        road.from.z + (road.to.z - road.from.z) * t);
      const grade = Math.abs(y - previous) / (length / steps);
      maxGrade = Math.max(maxGrade, grade);
      previous = y; samples++;
    }
    if (maxGrade > maxRisePerUnit) flagged.push({ roadId: road.id, reason: 'grade',
      maxGrade: Math.round(maxGrade * 1000) / 1000 });
  }
  return { roadCount: roads.length, samples, maxRisePerUnit, flagged, acceptable: flagged.length === 0 };
}
