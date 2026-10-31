// Read-only reconciliation of the shared Homefront building occupants.
// World snapshots, not this helper, remain the source of gameplay authority.
export function mergeSharedInteriorPresence(world, response) {
  const current = world?.interiorInstance;
  const incoming = response?.interiorInstance;
  if (!current?.id || current.id !== incoming?.id ||
      current.landmarkId !== incoming.landmarkId ||
      !Array.isArray(response.players)) return null;
  const occupants = new Map((incoming.occupants || [])
    .filter(p => typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z))
    .map(p => [p.id, p]));
  const peers = response.players.filter(p => occupants.has(p.id) &&
    p.interior?.instanceId === current.id &&
    Number.isFinite(p.x) && Number.isFinite(p.z));
  const oldIds = new Set((world.players || [])
    .filter(p => p.interior?.instanceId === current.id).map(p => p.id));
  const newIds = new Set(peers.map(p => p.id));
  const rosterChanged = oldIds.size !== newIds.size ||
    [...oldIds].some(id => !newIds.has(id));
  const existing = new Map((world.players || []).map(p => [p.id, p]));
  for (const p of peers) existing.set(p.id, p);
  const updatedPlayers = [...existing.values()].filter(p =>
    p.interior?.instanceId !== current.id || newIds.has(p.id));
  return {
    world: { ...world, players: updatedPlayers, interiorInstance: incoming,
      interior: response.interior ?? world.interior },
    rosterChanged
  };
}
