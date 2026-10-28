// Shared trait palettes for 589 Protocol and RACC, sampled from the collections' own art (numbers only, no art stored).
// Each trait value maps to the same colours on every token that has it (shared-base collections).
// skin = base, shadow = crease/underside tone, accent = brows/logo/trim, metal = chains/halo, glow = emissive bits.
export const PAL_589_BODY = Object.freeze({
  'flame on':      { skin: '#e3b52a', shadow: '#a1300a', crackle: 1 },   // molten yellow with red lava cracks
  'heating up':    { skin: '#8a3020', shadow: '#3f1410', crackle: .25 }, // deep red-brown
  'about to burn': { skin: '#5e2418', shadow: '#2a0e08', crackle: .2 },
  'cool off':      { skin: '#94979c', shadow: '#55585e', crackle: 0 }    // ash grey
});
export const PAL_589_CLOTH = Object.freeze({
  'blue tee': '#3a4b7d', 'red burn tee': '#d0402e', 'burn xrp tee': '#d8bb84', 'punk burner': '#ede9df',
  'black burn tee': '#141416', 'bxrp jersey': '#c8352a', 'burn king': '#c8352a', 'space suit': '#e2e4e8'
});
export const PAL_589 = Object.freeze({ accent: '#e8601a', metal: '#e2b04a', glow: '#ff8a1e', cap: '#565656', logo: '#c8352a',
  shiestyRed: '#d12d0e', shiestyBlack: '#1a1a1a', denim: '#283041' });
export const PAL_RACC = Object.freeze({ skin: '#7a7c82', shadow: '#343538', accent: '#141414', metal: '#c9ccd2', glow: '#3f7fc0', crackle: 0 });
export function palette589(body) { return PAL_589_BODY[String(body || '').trim().toLowerCase()] || null; }
export function cloth589(cloth) { return PAL_589_CLOTH[String(cloth || '').trim().toLowerCase()] || ''; }
