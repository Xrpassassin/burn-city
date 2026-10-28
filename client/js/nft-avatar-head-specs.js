// Sculpt specs (SDF primitive lists) for organic NFT heads. Head-local frame matches nftchar.js:
// +z is the face, eyes sit near y .045, chin near y -.2, unit is the pre-scale head size.
// 'mirror: true' duplicates a primitive on the other side (x -> -x).
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };

/** Realistic human head: cranium, brow ridge, cheekbones, jaw, chin, nose, lips, ears, eye sockets. */
export function humanHeadSpec(hs = {}, skin = '#7a4526', extra = {}) {
  const W = hs.skullW || 1, H = hs.skullH || 1, J = hs.jawW || 1, lip = shade(skin, .78), dark = shade(skin, .62);
  const prims = [
    { t: 'e', c: [0, .055, -.025], r: [.172 * W, .195 * H, .2], col: skin },                       // cranium
    { t: 'e', c: [0, -.025, .055], r: [.138 * W, .175, .128], col: skin },                         // face mass
    { t: 'e', c: [.083, .005, .118], r: [.05, .034, .055], col: skin, mirror: true, k: .035 },    // cheekbones
    { t: 'c', a: [-.08, .083, .148], b: [.08, .083, .148], r1: .026, col: skin, k: .03 },          // brow ridge
    { t: 'c', a: [.1 * J, -.055, .02], b: [.034, -.168 - (hs.jawDrop || 0), .102], r1: .052 * J, r2: .036, col: skin, mirror: true, k: .05 }, // jaw
    { t: 'e', c: [0, -.178 - (hs.jawDrop || 0), .118], r: [.048 * J, .034, .04], col: skin, k: .04 },  // chin
    { t: 'c', a: [0, .05, .163], b: [0, -.022, .2], r1: .013, r2: .025, col: skin, k: .02 },        // nose bridge -> tip
    { t: 'e', c: [.022, -.034, .183], r: [.018, .014, .016], col: skin, mirror: true, k: .015 },  // alar wings
    { t: 'e', c: [0, -.094, .162], r: [.044, .015, .02], col: lip, k: .015, w: 1.4 },             // lips
    { t: 'e', c: [.168 * W, .005, -.005], r: [.022, .052 * (hs.earSize || 1), .036], col: skin, mirror: true, k: .02 }, // ears
    { t: 'e', c: [.066, .046, .2], r: [.04, .024, .032], col: dark, sub: true, mirror: true, k: .03 } // eye sockets
  ];
  return { prims: [...prims, ...(extra.prims || [])], k: .045, origin: [0, -.01, .02], rMax: .42 };
}
export function wolfHeadSpec(c = {}) {
  const fur = c.fur || '#d9581c', light = c.light || '#f2a35e', dark = c.dark || '#9e3410';
  return { k: .05, colorK: .016, origin: [0, -.02, .06], rMax: .5, prims: [
    { t: 'e', c: [0, .045, -.015], r: [.16, .15, .17], col: fur },                                  // cranium
    { t: 'e', c: [.108, -.055, .025], r: [.092, .1, .1], col: light, mirror: true, k: .06 },       // cheek ruffs
    { t: 'c', a: [0, -.005, .1], b: [0, -.045, .315], r1: .074, r2: .03, col: fur, k: .05 },        // long tapered snout
    { t: 'c', a: [0, -.085, .07], b: [0, -.092, .275], r1: .05, r2: .02, col: light, k: .03 },      // lower jaw
    { t: 'e', c: [0, -.032, .325], r: [.03, .022, .022], col: '#141416', k: .012, w: 3 },          // nose leather
    { t: 'e', c: [.058, .072, .12], r: [.05, .028, .055], col: dark, mirror: true, k: .04 },       // brow
    { t: 'c', a: [.085, .14, -.03], b: [.145, .345, -.05], r1: .06, r2: .007, col: dark, mirror: true, k: .03 }, // pointed ears
    { t: 'e', c: [0, -.17, -.02], r: [.2, .13, .18], col: light, k: .07 },                          // neck ruff
    { t: 'e', c: [.062, .052, .158], r: [.026, .018, .026], col: '#2a0d06', sub: true, mirror: true, k: .02 }
  ] };
}
export function reptileHeadSpec(c = {}) {
  const sc = c.scale || '#1b1c21', belly = c.belly || '#2f3036';
  return { k: .045, origin: [0, 0, .06], rMax: .48, prims: [
    { t: 'e', c: [0, .045, -.02], r: [.15, .125, .17], col: sc },
    { t: 'e', c: [0, .0, .16], r: [.098, .075, .17], col: sc, k: .06 },                                 // long flat snout
    { t: 'e', c: [0, -.07, .12], r: [.088, .038, .15], col: belly },                                   // jaw
    { t: 'e', c: [.074, .085, .1], r: [.052, .03, .075], col: sc, mirror: true, k: .03 },             // brow ridges
    { t: 'e', c: [0, -.15, -.02], r: [.12, .12, .13], col: belly, k: .07 },                            // neck
    { t: 'e', c: [.085, .066, .122], r: [.03, .02, .035], col: '#0b0b0d', sub: true, mirror: true },
    { t: 'e', c: [.03, .012, .32], r: [.012, .01, .016], col: '#0b0b0d', sub: true, mirror: true, k: .01 }
  ] };
}
export function monkeyHeadSpec(c = {}) {
  const fur = c.fur || '#5a3d26', face = c.face || '#c9a07a';
  return { k: .045, origin: [0, 0, .03], rMax: .42, prims: [
    { t: 'e', c: [0, .05, -.02], r: [.168, .168, .17], col: fur },
    { t: 'e', c: [0, .005, .082], r: [.128, .138, .1], col: face },
    { t: 'e', c: [0, -.08, .14], r: [.1, .07, .082], col: shade(face, 1.08) },                         // muzzle
    { t: 'c', a: [-.07, .072, .14], b: [.07, .072, .14], r1: .03, col: fur, k: .03 },                  // heavy brow
    { t: 'e', c: [.178, .02, 0], r: [.03, .072, .062], col: face, mirror: true, k: .02 },              // big ears
    { t: 'e', c: [.02, -.062, .215], r: [.012, .008, .01], col: '#2a1a10', sub: true, mirror: true, k: .01 },
    { t: 'e', c: [.058, .042, .16], r: [.035, .022, .03], col: shade(face, .7), sub: true, mirror: true, k: .025 }
  ] };
}
export function skullHeadSpec(c = {}) {
  const bone = c.bone || '#e6dcc4', hole = '#141213';
  return { k: .04, colorK: .01, origin: [0, 0, .03], rMax: .42, prims: [
    { t: 'e', c: [0, .06, -.012], r: [.168, .182, .19], col: bone },
    { t: 'e', c: [.084, -.02, .108], r: [.05, .04, .06], col: bone, mirror: true, k: .03 },
    { t: 'e', c: [0, -.06, .1], r: [.09, .062, .09], col: bone },
    { t: 'c', a: [.09, -.07, .0], b: [.032, -.168, .09], r1: .034, r2: .03, col: bone, mirror: true, k: .03 },
    { t: 'e', c: [0, -.112, .142], r: [.07, .03, .04], col: '#f4ecd8', k: .015 },                      // teeth row
    { t: 'e', c: [.064, .04, .158], r: [.046, .043, .05], col: hole, sub: true, mirror: true, k: .02 },
    { t: 'e', c: [0, -.02, .19], r: [.02, .032, .04], col: hole, sub: true, k: .015 },
    ...(c.brain ? [{ t: 'e', c: [0, .17, -.005], r: [.142, .075, .15], col: '#e48aa0', k: .03 }] : [])
  ] };
}
export function greatHelmSpec(c = {}) {
  const m = c.metal || '#2c2e2a';
  return { k: .03, origin: [0, 0, 0], rMax: .4, prims: [
    { t: 'e', c: [0, .02, 0], r: [.205, .255, .205], col: m },
    { t: 'e', c: [0, -.02, .11], r: [.17, .21, .11], col: m, k: .05 },                                // flattened face plate
    { t: 'c', a: [0, .25, .14], b: [0, .24, -.18], r1: .02, col: shade(m, 1.3), k: .03 },               // crest ridge
    { t: 'e', c: [0, .045, .21], r: [.15, .012, .06], col: '#0a0a0a', sub: true, k: .008 }              // visor slit
  ] };
}
export function birdHeadSpec(c = {}) {
  const f = c.feather || '#e0912e', beak = c.beak || '#f2c94c';
  return { k: .045, origin: [0, 0, .05], rMax: .45, prims: [
    { t: 'e', c: [0, .05, -.01], r: [.15, .16, .17], col: f },
    { t: 'e', c: [.09, -.04, .04], r: [.08, .09, .09], col: shade(f, 1.12), mirror: true, k: .05 },
    { t: 'c', a: [0, .01, .14], b: [0, -.06, .3], r1: .055, r2: .012, col: beak, k: .03, w: 2 },        // hooked beak
    { t: 'c', a: [0, -.06, .3], b: [0, -.1, .27], r1: .012, r2: .006, col: beak, k: .01, w: 2 },
    { t: 'c', a: [0, .16, -.05], b: [0, .26, -.2], r1: .05, r2: .01, col: shade(f, .8), k: .04 },        // crest feathers
    { t: 'e', c: [0, -.16, -.02], r: [.15, .11, .15], col: shade(f, 1.1), k: .06 }
  ] };
}
