// Collection-aware NFT trait normalization for BURN City avatars.
// This layer changes rendering interpretation only; it never establishes NFT ownership.
// Unknown and original traits are retained so new collection adapters can be added without data loss.
const COMMON = [
  ['background', /background|backdrop|scene$/i],
  ['eye color', /eye.?colou?r|iris.?colou?r/i],
  ['eye appearance', /^eye$/i],
  ['body effect', /^body$/i],
  ['accessory', /^chain$/i],
  ['outfit', /^clothing$|^fits$/i],
  ['headwear', /^head$|^top gear$/i],
  ['weapon', /^armed$/i],
  ['fur color', /fur.?colou?r|^fur$/i],
  ['hair style', /hair.?style|hairstyle|haircut|hair.?shape/i],
  ['hair color', /^hair$|hair.?colou?r/i],
  ['skin color', /skin.?tone|skin.?colou?r/i],
  ['outfit', /clothes|outfit|shirt|topwear|bodywear|jacket|robe|clothing/i],
  ['armor', /armou?r|chestplate|plate.?carrier/i],
  ['headwear', /headwear|hat|helmet|crown|cap|beanie|hood|head.?gear/i],
  ['mask', /mask|face.?cover/i],
  ['expression', /mouth|expression|emotion|face.?mood/i],
  ['facial hair', /beard|goatee|mustache|moustache|facial.?hair/i],
  ['markings', /markings?|face.?paint|tattoo|scar|freckles|war.?paint/i],
  ['body pattern', /body.?pattern|pattern|camo|camouflage|stripes?|spots?|markings?$/i],
  ['horns', /horns?|antlers?|tusks?/i],
  ['wing', /wings?|feathers?/i],
  ['weapon', /weapon|held.?item|gun|sword|blade|gear/i],
  ['accessory', /accessor(y|ies)|jewel(l)?ery|necklace|chain|medallion|earring/i],
  ['flame', /flame|fire|ember|burn.?effect|aura/i],
  ['eye wear', /sunglasses|eyewear|glasses|spectacles|goggles|frames|visor/i],
  ['tail', /tail/i]
];
const COLLECTIONS = {
  racc: {
    name: 'RACC',
    aliases: [
      // Collection/archetype labels are already represented by the collection key, not wearable geometry.
      ['identity', /raccoon.?guy|racc.?archetype/i],
      ['mask', /bandit.?mask|eye.?mask|raccoon.?mask/i],
      ['fur color', /pelt|coat.?fur|raccoon.?fur/i],
      ['tail', /ring.?tail|tail.?pattern/i],
      ['headwear', /head.?accessory|head.?item/i]
    ]
  },
  fk: {
    name: 'Firekeepers',
    aliases: [
      ['flame', /ember.?type|fire.?type|flame.?effect|aura.?type/i],
      ['outfit', /keeper.?robes?|uniform|garment/i],
      ['headwear', /cowl|circlet|flame.?crown/i],
      ['accessory', /relic|sigil|totem/i]
    ]
  },
  '589': {
    name: '589 Protocol',
    aliases: [
      ['outfit', /suit.?type|streetwear|clothing.?type/i],
      ['headwear', /helmet.?type|headgear.?type|hat.?type/i],
      ['accessory', /chain.?type|jewelry.?type|bling/i],
      ['weapon', /weapon.?type|loadout/i]
    ]
  }
};
const normalize = value => String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
function classifyType(type, key) {
  const raw = normalize(type);
  const collection = COLLECTIONS[key];
  for (const [slot, pattern] of collection?.aliases || []) if (pattern.test(raw)) return slot;
  for (const [slot, pattern] of COMMON) if (pattern.test(raw)) return slot;
  return raw;
}
function stableHash(value) {
  let h = 2166136261;
  for (const ch of String(value || 'burn-city-nft')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function resolveNftAvatarProfile(nft = {}) {
  const key = ['racc', 'fk', '589'].includes(String(nft.key || '').toLowerCase()) ? String(nft.key).toLowerCase() : 'generic';
  const rawTraits = (Array.isArray(nft.traits) ? nft.traits : [])
    .filter(pair => Array.isArray(pair) && pair.length > 1)
    .slice(0, 64)
    .map(([type, value]) => [String(type), String(value)]);
  const renderTraits = rawTraits.map(([type, value]) => [classifyType(type, key), value]);
  const id = String(nft.id || nft.nftId || nft.name || '');
  return {
    collectionKey: key,
    collectionName: COLLECTIONS[key]?.name || 'Unmapped collection',
    archetype: key === 'racc' ? 'raccoon' : 'humanoid',
    identitySeed: stableHash(id),
    rawTraits,
    renderTraits,
    hasCollectionAdapter: !!COLLECTIONS[key]
  };
}
