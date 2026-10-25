import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../tools/blender/nft_avatar_generator.py', import.meta.url), 'utf8');
for (const name of ['RACC_Fits_Stripe_', 'RACC_TopGear_Cap', 'RACC_Armed_TNT_', 'RACC_Armed_BeeHive',
  'Protocol_Punk_Shoulder_Stud_', 'Protocol_Head_Fitted', 'Protocol_Mouth_Neutral',
  'Protocol_Angry_Brow_', 'Keeper_Trait_Relic_Staff']) {
  assert.ok(source.includes(name), 'missing distinct collection trait geometry: ' + name);
}
assert.match(source, /source_traits\[name\] = value/, 'raw trait vocabulary is retained');
assert.match(source, /anchor\["blockout_only"\]=True/, 'candidate cannot claim runtime approval');
console.log('Collection-specific Blender NFT identity geometry assertions passed.');
