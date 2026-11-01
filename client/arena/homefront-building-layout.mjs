// Shared, versioned Homefront building layout. Visual additions must not alter
// the deterministic RNG sequence used for collision or saved world coordinates.
export const HOMEFRONT_LAYOUT_VERSION = 1;
export const HOMEFRONT_LAYOUT_SEED = 8675309;
export function* homefrontBuildingLayout() {
  let seed = HOMEFRONT_LAYOUT_SEED;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let x = -90; x <= 90; x += 10) for (let z = -90; z <= 90; z += 10) {
    if (rand() < 0.27 || Math.abs(x % 20) < 5 || Math.abs(z % 20) < 5) continue;
    const bx = x + (rand() - 0.5) * 2.2, bz = z + (rand() - 0.5) * 2.2;
    if (Math.hypot(bx, bz) < 13) continue;
    const w = 3.4 + rand() * 3.4, d = 3.4 + rand() * 3.4;
    const h = 3 + rand() * (Math.hypot(bx, bz) > 65 ? 11 : 6);
    const materialIndex = Math.floor(rand() * 4);
    const rotation = (rand() - 0.5) * 0.16;
    const roof = rand() > 0.45 ? { xOffset: rand() - .5, zOffset: rand() - .5 } : null;
    const emberHeight = rand() > 0.7 ? 1.2 + rand() : null;
    yield { id: 'building:' + x + ',' + z, x: bx, z: bz, w, d, h, materialIndex, rotation, roof, emberHeight };
  }
}
