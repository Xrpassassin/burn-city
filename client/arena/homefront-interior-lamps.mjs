// Authored Homefront room power cues. The server owns flags; this only adjusts
// the material of EXISTING instanced emergency wall lamps. No light objects,
// bloom, shadow passes, new particle meshes or gameplay advantages.
const GRID = Object.freeze({
  mercy_hospital: 'emergency_power',
  ashfall_station: 'ashfall_grid',
  research_annex: 'blackglass_power'
});
export function interiorLampProfile(landmarkId, flags = []) {
  const present = Array.isArray(flags) ? flags : [];
  const required = GRID[landmarkId];
  if (required) return {
    mode:present.includes(required)?'restored':'backup',
    intensity:present.includes(required)?0.88:0.12
  };
  if (landmarkId === 'ironworks')
    return { mode:present.includes('power_cut')?'isolated':'backup',
      intensity:present.includes('power_cut')?0.06:0.36 };
  return { mode:'battery', intensity:0.32 };
}
export function applyInteriorLampProfile(root, state) {
  if (!root || !state || root.userData?.interiorLandmarkId !== state.landmarkId) return null;
  const setting=interiorLampProfile(state.landmarkId,state.flags);
  let changed=0;
  // Lamp batches are direct children of their authored room shell. Restrict
  // updates to that tagged batch, never other shared interior meshes.
  for (const child of root.children || []) {
    if (!child?.userData?.homefrontEmergencyLamps || !child.material) continue;
    child.material.emissiveIntensity=setting.intensity;
    changed++;
  }
  return changed ? { ...setting, batches:changed } : null;
}
