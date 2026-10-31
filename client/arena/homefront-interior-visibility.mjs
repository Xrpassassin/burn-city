// Render-only LOD for shared Homefront building interiors. The same server
// world persists across entering/leaving; this swaps meshes, not instances,
// movement rules, permission state, or player positions.
export function applyInteriorVisualLayers(activeLandmarkId, interiorSetPieces, landmarkSetPieces) {
  if (!(interiorSetPieces instanceof Map) || !(landmarkSetPieces instanceof Map))
    throw new TypeError('building mesh index maps required');
  const active = interiorSetPieces.has(activeLandmarkId) ? activeLandmarkId : null;
  for (const [landmarkId, roomRoot] of interiorSetPieces) {
    if (roomRoot) roomRoot.visible = landmarkId === active;
  }
  for (const [landmarkId, facade] of landmarkSetPieces) {
    // Unrelated decorative landmarks stay untouched; only enterable buildings
    // swap their opaque facade with their detailed interior room meshes.
    if (facade && interiorSetPieces.has(landmarkId)) facade.visible = landmarkId !== active;
  }
  return active;
}
