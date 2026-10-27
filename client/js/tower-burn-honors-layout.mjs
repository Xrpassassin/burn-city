// Deterministic, collision-aware layout for honored NFT avatars outside BURN Tower.
// Takes the real tower origin/orientation from the city scene; never hardcodes world coordinates.
// Outputs positions for the existing shared NFT avatar renderer to instantiate.
export function towerHonorPositions(honorees, tower, options = {}) {
  const { x, z, facing = 0 } = tower || {};
  if (![x, z, facing].every(Number.isFinite)) throw Error('tower location/facing required');
  const walkwayRadius = Number.isFinite(options.radius) ? options.radius : 20;
  const spacing = Number.isFinite(options.spacing) ? options.spacing : 4;
  const max = Math.min(10, Math.max(0, Math.floor(options.max ?? 10)));
  if (walkwayRadius < 8 || spacing < 2.5) throw Error('unsafe tower forecourt spacing');
  const selected = (honorees || []).slice(0, max);
  // Arc faces tower entrance, leaving center passage open.
  const positions = [];
  for (let i = 0; i < selected.length; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2) + 1;
    const lateral = side * row * spacing;
    const forward = walkwayRadius + Math.floor((row - 1) / 3) * spacing;
    const dx = Math.cos(facing) * lateral + Math.sin(facing) * forward;
    const dz = -Math.sin(facing) * lateral + Math.cos(facing) * forward;
    positions.push({
      ...selected[i], position: { x: x + dx, z: z + dz },
      yaw: facing + Math.PI, slot: i,
      // Renderer/scene must check actual walkable terrain, entrances and colliders before instantiation.
      placementVerified: false
    });
  }
  return positions;
}
