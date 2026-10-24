import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileNftAvatarBuildSpec } from './nft-avatar-build-spec.mjs';

const spec = compileNftAvatarBuildSpec({
  key: '589', id: 'TOKEN-007', name: 'Trait Test',
  traits: [
    ['Clothing', 'Red Jacket'], ['Head', 'Gold Crown'], ['Eye', 'Laser'],
    ['Chain', 'Silver Necklace'], ['Mouth', 'Smirk'], ['Armed', 'Katana'],
    ['Wing', 'Angel Wings'], ['Eye Color', 'Blue']
  ]
});
assert.equal(spec.identity.tokenId, 'TOKEN-007');
assert.equal(spec.traits.normalized.length, 8);
assert.ok(spec.traits.normalized.some(t => t.renderSlot === 'outfit' && t.sourceValue === 'Red Jacket'));
assert.ok(spec.traits.normalized.some(t => t.renderSlot === 'headwear' && t.sourceValue === 'Gold Crown'));
assert.ok(spec.traits.normalized.some(t => t.renderSlot === 'accessory' && t.sourceValue === 'Silver Necklace'));
assert.ok(spec.traits.normalized.some(t => t.renderSlot === 'weapon' && t.sourceValue === 'Katana'));

const source = fs.readFileSync(new URL('../tools/blender/nft_avatar_generator.py', import.meta.url), 'utf8');
for (const feature of [
  'trait_color', 'Trait_Crown_Peak_', 'Trait_Eyewear_Lens_', 'Trait_Horn_',
  'Trait_Wing_', 'Trait_Weapon_Blade', 'Trait_Facial_Hair', 'Trait_Tail',
  'Trait_Necklace', 'Trait_Hair_Spike_', 'Trait_Expression_Smile', 'Trait_Face_Mask', 'Trait_Face_Marking_', 'Trait_Body_Effect_', 'trait_snapshot_json'
]) assert.ok(source.includes(feature), 'GLB generator must support ' + feature);
assert.ok(source.includes('spec.get("traits", {}).get("normalized", [])'), 'generator consumes normalized per-token traits');
console.log('NFT avatar token trait geometry: 14 assertions passed');
