// Preview-only saved-position obstruction analysis for Homefront v2.
// This module does not move players, change persisted data, or enable v2.
export function auditHomefrontSavedPositions({ positions, buildings, playerRadius = 0.45, clearance = 0.3 } = {}) {
  if (!Array.isArray(positions) || !Array.isArray(buildings)) throw new TypeError('positions and buildings must be arrays');
  if (![playerRadius, clearance].every(v => Number.isFinite(v) && v >= 0)) throw new RangeError('invalid clearance');
  const hazards = [];
  for (const [index, position] of positions.entries()) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
      hazards.push({ index, id: position?.id ?? null, reason: 'invalid_position' });
      continue;
    }
    for (const building of buildings) {
      if (![building.x, building.z, building.w, building.d].every(Number.isFinite) ||
        building.w <= 0 || building.d <= 0) throw new TypeError('invalid building footprint');
      // Conservative circle vs rotated rectangle: transform player center to local axes.
      const angle = Number.isFinite(building.rotation) ? building.rotation : 0;
      const dx = position.x - building.x, dz = position.z - building.z;
      const lx = dx * Math.cos(angle) - dz * Math.sin(angle);
      const lz = dx * Math.sin(angle) + dz * Math.cos(angle);
      const edgeX = Math.max(Math.abs(lx) - building.w / 2, 0);
      const edgeZ = Math.max(Math.abs(lz) - building.d / 2, 0);
      if (Math.hypot(edgeX, edgeZ) < playerRadius + clearance) {
        hazards.push({ index, id: position.id ?? null, reason: 'building_obstruction', buildingId: building.id ?? null });
      }
    }
  }
  return { inspected: positions.length, hazards, clear: hazards.length === 0, previewOnly: true };
}
