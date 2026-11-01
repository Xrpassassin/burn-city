'use strict';
// Read-only server preflight for proposed Homefront v2 coordinate migrations.
// Uses CURRENT v1 authoritative collision and terrain, not an unimplemented v2 collision catalog.
// It MUST NOT be used as a v2 activation permit or to write saved coordinates.
const Collision = require('./homefront-collision');

function validateHomefrontMigrationCandidates(proposals, { positions = [], radius = Collision.PLAYER_RADIUS } = {}) {
  if (!Array.isArray(proposals) || !Array.isArray(positions)) throw new TypeError('expected arrays');
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('invalid player radius');
  const results = proposals.map((entry, index) => {
    const point = entry?.to;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z))
      return { index, id: entry?.id ?? null, approved: false, reason: 'missing_or_invalid_destination' };
    const terrainAndCollisionSafe = Collision.isSafePosition(point.x, point.z, {
      radius, removedObstacleIds: Collision.INTERIOR_OBSTACLE_IDS
    });
    if (!terrainAndCollisionSafe) return { index, id: entry?.id ?? null, approved: false,
      reason: 'current_server_terrain_or_collision' };
    const occupied = positions.some(p => p && p.id !== entry.id && Number.isFinite(p.x) &&
      Number.isFinite(p.z) && Math.hypot(point.x - p.x, point.z - p.z) < radius * 2);
    if (occupied) return { index, id: entry?.id ?? null, approved: false, reason: 'snapshot_occupancy' };
    return { index, id: entry?.id ?? null, approved: false, reason: 'v2_authoritative_collision_not_implemented',
      passedCurrentServerChecks: true };
  });
  return { version: 2, previewOnly: true, canApply: false, results,
    requires: ['versioned v2 server obstacles', 'runtime multiplayer occupancy lock',
      'atomic saved-state migration with rollback', 'v2 terrain/nav route tests'] };
}
module.exports = { validateHomefrontMigrationCandidates };
