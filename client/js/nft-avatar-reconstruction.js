// Collection-specific procedural reconstruction blueprints for BURN CITY NFT walkers.
// These are authored rig/shape recipes, not claims of exact 1:1 reconstruction.
// Exact likeness improves when collection-approved layered art or rigged models are supplied.
const BLUEPRINTS = {
  racc: {
    collectionKey: 'racc', archetype: 'anthropomorphic-raccoon',
    torsoWidth: 1.08, torsoHeight: .94, headScale: [1.08, 1.06, 1.02],
    shoulderSpan: .29, hipSpan: .13, headY: 1.75, legScale: .91, armScale: .97,
    silhouetteTags: ['rounded-raccoon-skull', 'eye-mask', 'muzzle', 'ringed-tail'],
    signature: 'raccoon'
  },
  fk: {
    collectionKey: 'fk', archetype: 'firekeeper',
    torsoWidth: .98, torsoHeight: 1.04, headScale: [1, 1.03, 1],
    shoulderSpan: .30, hipSpan: .12, headY: 1.79, legScale: 1, armScale: .98,
    silhouetteTags: ['layered-robe', 'cowl', 'ember-mantle', 'sigil'],
    signature: 'firekeeper'
  },
  '589': {
    collectionKey: '589', archetype: 'burn-protocol-humanoid',
    torsoWidth: 1.06, torsoHeight: 1, headScale: [1.02, 1, 1],
    shoulderSpan: .34, hipSpan: .13, headY: 1.78, legScale: 1, armScale: 1.02,
    silhouetteTags: ['streetwear', 'burn-insignia', 'chain', 'tech-gear'],
    signature: 'protocol'
  },
  generic: {
    collectionKey: 'generic', archetype: 'humanoid',
    torsoWidth: 1, torsoHeight: 1, headScale: [1, 1, 1],
    shoulderSpan: .32, hipSpan: .125, headY: 1.77, legScale: 1, armScale: 1,
    silhouetteTags: [], signature: 'generic'
  }
};
const clone = value => ({ ...value, headScale: [...value.headScale], silhouetteTags: [...value.silhouetteTags] });

export function resolveNftAvatarReconstruction(profile = {}) {
  const key = String(profile.collectionKey || 'generic').toLowerCase();
  const blueprint = clone(BLUEPRINTS[key] || BLUEPRINTS.generic);
  const traits = Array.isArray(profile.renderTraits) ? profile.renderTraits : [];
  const valueFor = slot => String(traits.find(([type]) => type === slot)?.[1] ?? '').trim();
  const outfit = valueFor('outfit');
  const headwear = valueFor('headwear');
  const body = valueFor('body effect');
  return {
    ...blueprint,
    collectionName: String(profile.collectionName || 'Unmapped collection'),
    identitySeed: Number(profile.identitySeed || 0) >>> 0,
    traitOverrides: {
      robe: key === 'fk' || /robe|cloak|mantle/i.test(outfit),
      hood: /hood|cowl/i.test(headwear) || key === 'fk',
      fire: /flame on|heating up|about to burn|burning/i.test(body) || key === 'fk',
      originalArtworkRequired: true
    },
    fidelityMode: 'procedural-collection-specific',
    exactReconstruction: false
  };
}

export const NFT_AVATAR_RECONSTRUCTION_COLLECTIONS = Object.freeze(Object.keys(BLUEPRINTS));
