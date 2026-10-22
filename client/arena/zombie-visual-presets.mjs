// Cosmetic palettes for future zombie/player/weapon render adapters.
// This module does not change gameplay IDs, hitboxes, or network state.
const PRESETS = Object.freeze({
  refinery: Object.freeze({
    zombie: Object.freeze({ skin: '#77756b', shadow: '#302d2a', wound: '#6b2923', eye: '#ff4b1f', armor: '#3d4545' }),
    player: Object.freeze({ cloth: '#6d5946', trim: '#d28a35', metal: '#555d60', accent: '#ff6a2a' }),
    weapon: Object.freeze({ body: '#27292c', metal: '#777b7c', heat: '#ff5b1e', upgraded: '#ffb02e' }),
    wall: Object.freeze({ base: '#59483b', upper: '#8a6a54', metal: '#3d4145', trim: '#ff6a2a' })
  }),
  ashfall: Object.freeze({
    zombie: Object.freeze({ skin: '#77796e', shadow: '#292b2a', wound: '#55201f', eye: '#d9ff67', armor: '#464b40' }),
    player: Object.freeze({ cloth: '#4e5547', trim: '#b2b58a', metal: '#424a4a', accent: '#d9ff67' }),
    weapon: Object.freeze({ body: '#242927', metal: '#777e70', heat: '#d9ff67', upgraded: '#f0d36a' }),
    wall: Object.freeze({ base: '#484b40', upper: '#777b67', metal: '#383e3d', trim: '#d9ff67' })
  }),
  blacktide: Object.freeze({
    zombie: Object.freeze({ skin: '#777c83', shadow: '#252b34', wound: '#6a252e', eye: '#48e0d0', armor: '#263c47' }),
    player: Object.freeze({ cloth: '#263d4a', trim: '#b88b58', metal: '#4a5c66', accent: '#48e0d0' }),
    weapon: Object.freeze({ body: '#222c33', metal: '#73858c', heat: '#48e0d0', upgraded: '#d9a85c' }),
    wall: Object.freeze({ base: '#364650', upper: '#667b82', metal: '#293943', trim: '#48e0d0' })
  })
});

export function getZombieVisualPreset(name = 'refinery') {
  return PRESETS[name] || PRESETS.refinery;
}

export function isZombieVisualPreset(name) {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

export function listZombieVisualPresets() {
  return Object.keys(PRESETS);
}
