// Deterministic, presentation-only nearest physical interior action.
// The Homefront server independently validates room, distance, power/door
// requirements, loot and account identity on every POST. Never trust this helper
// for authorization. Model positions and rules come from the shared room catalog.
import { interiorRoom, availableInteriorActions } from './homefront-interior-world.mjs';

export const ROOM_ACTION_RANGE = 2.8;
const sidePoint = (room, side) => ({
  x: room.x + (side === 'east' ? room.width / 2 : side === 'west' ? -room.width / 2 : 0),
  z: room.z + (side === 'south' ? room.depth / 2 : side === 'north' ? -room.depth / 2 : 0)
});

export function nearestInteriorInteraction(interior, state, origin, player, range = ROOM_ACTION_RANGE) {
  if (!interior || !state || state.landmarkId !== interior.landmarkId ||
      !origin || !player ||
      !Number.isFinite(origin.x) || !Number.isFinite(origin.z) ||
      !Number.isFinite(player.x) || !Number.isFinite(player.z) ||
      !Number.isFinite(range) || range <= 0 || range > 4.8 ||
      Math.hypot(origin.x - player.x, origin.z - player.z) > 17) return null;
  const room = interiorRoom(interior, state.roomId);
  if (!room) return null;
  const candidates = [];
  const add = (kind, id, label, localX, localZ) => {
    const x = origin.x + localX, z = origin.z + localZ;
    const distance = Math.hypot(player.x - x, player.z - z);
    if (distance <= range) candidates.push({ kind, id, label, distance, x, z });
  };
  // Used objects do not advertise repeatable rewards; requirements are read
  // from the server-supplied effectiveState (including shared building power).
  for (const item of availableInteriorActions(interior, state)) {
    if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) continue;
    add('action', item.id, item.label, item.x, item.z);
  }
  for (const exit of room.exits) {
    if (!interiorRoom(interior, exit.to) ||
        (Array.isArray(exit.requires) &&
          !exit.requires.every(flag => (state.flags || []).includes(flag)))) continue;
    const point = sidePoint(room, exit.side);
    add('door', exit.id, exit.label + ' — ' + interiorRoom(interior, exit.to).title, point.x, point.z);
  }
  candidates.sort((a, b) => a.distance - b.distance ||
    (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'action' ? -1 : 1));
  const winner = candidates[0];
  if (!winner) return null;
  return Object.freeze({ ...winner, label: winner.label.slice(0, 78) });
}
