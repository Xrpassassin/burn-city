import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileNftAvatarBuildSpec } from './nft-avatar-build-spec.mjs';

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };

const spec = compileNftAvatarBuildSpec({
  key: '589', id: 'TOKEN-007', name: 'Trait Test',
  traits: [
    ['Clothing', 'Red Jacket'], ['Head', 'Gold Crown'], ['Eye', 'Laser'],
    ['Chain', 'Silver Necklace'], ['Mouth', 'Smirk'], ['Armed', 'Katana'],
    ['Wing', 'Angel Wings'], ['Eye Color', 'Blue']
  ]
});
equal(spec.identity.tokenId, 'TOKEN-007', 'preserves exact token identity');
equal(spec.traits.normalized.length, 8, 'preserves typed trait count');
check(spec.traits.normalized.some(t => t.renderSlot === 'outfit' && t.sourceValue === 'Red Jacket'), 'normalizes outfit');
check(spec.traits.normalized.some(t => t.renderSlot === 'headwear' && t.sourceValue === 'Gold Crown'), 'normalizes headwear');
check(spec.traits.normalized.some(t => t.renderSlot === 'accessory' && t.sourceValue === 'Silver Necklace'), 'normalizes accessories');
check(spec.traits.normalized.some(t => t.renderSlot === 'weapon' && t.sourceValue === 'Katana'), 'normalizes weapons');

const source = fs.readFileSync(new URL('../tools/blender/nft_avatar_generator.py', import.meta.url), 'utf8');
for (const feature of [
  'trait_color', 'Trait_Crown_Peak_', 'Trait_Eyewear_Lens_', 'Trait_Horn_',
  'Trait_Wing_', 'Trait_Weapon_Blade', 'Trait_Facial_Hair', 'Trait_Tail',
  'Trait_Necklace', 'Trait_Hair_Spike_', 'Trait_Expression_Smile', 'Trait_Face_Mask', 'Trait_Face_Marking_', 'Trait_Body_Effect_', 'trait_snapshot_json'
 ]) check(source.includes(feature), 'GLB generator must support ' + feature);
check(source.includes('spec.get("traits", {}).get("normalized", [])'), 'generator consumes normalized per-token traits');
console.log('NFT avatar token trait geometry: ' + checks + ' assertions passed');
