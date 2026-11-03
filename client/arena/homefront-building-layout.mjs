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

// Version 2 is an opt-in planning manifest, not yet a live collision map.
// Spawn, POI and saved-coordinate migration must be reviewed before activation.
export const HOMEFRONT_ORGANIC_LAYOUT_VERSION = 2;
function siteHash(x,z,salt=0) {
  let h = (Math.imul(x,0x1f123bb5) ^ Math.imul(z,0x5f356495) ^ salt ^ HOMEFRONT_LAYOUT_SEED) >>> 0;
  h = Math.imul(h ^ h >>> 15,0x2c1b3c6d) >>> 0;
  return ((h ^ h >>> 12) >>> 0) / 4294967296;
}
export function* homefrontOrganicLayoutPreview() {
  // Offset cells at two scales to produce clusters, breaks and oblique streets.
  // This MUST NOT be used by the live renderer/server until a migration exists.
  for (let gx=-8;gx<=8;gx++) for(let gz=-8;gz<=8;gz++) {
    const district = siteHash(Math.floor(gx/4), Math.floor(gz/4),21);
    const occupancy = siteHash(gx,gz,22);
    if (occupancy < 0.28 + district * 0.30) continue;
    const rotation = (siteHash(gx,gz,23)-0.5)*0.75;
    const x = gx*11 + (siteHash(gx,gz,24)-0.5)*6 + Math.sin(gz*0.44)*3;
    const z = gz*11 + (siteHash(gx,gz,25)-0.5)*6 + Math.cos(gx*0.39)*3;
    if (Math.hypot(x,z)<19 || Math.abs(x)>95 || Math.abs(z)>95) continue;
    const w = 3.3 + siteHash(gx,gz,26)*4.5;
    const d = 3.3 + siteHash(gx,gz,27)*4.5;
    const h = 3 + siteHash(gx,gz,28)*12;
    yield {id:'organic-building:'+gx+','+gz,x,z,w,d,h,rotation,district:Math.floor(district*4)};
  }
}
