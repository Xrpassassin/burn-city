import assert from 'node:assert/strict';
import { resolveNftAvatarProfile } from './nft-avatar-adapters.js';
import { resolveNftHeadShape, HEAD_BASE } from './nft-avatar-head.js';
let checks = 0; const ok = (v, m) => { assert.ok(v, m); checks++; };
const head = (key, traits, id = 'tok-1') => resolveNftHeadShape(resolveNftAvatarProfile({ key, id, traits }));
const p589 = (o = {}) => Object.entries({ Body: 'Heating Up', Chain: 'Burn Chain', Clothing: 'Blue Tee', Eye: 'Fr', Head: 'Burn XRP Fitted', Mouth: 'Hmp', ...o });
// Realistic proportions: 589 / Firekeepers heads are shrunk to ~1:6.5-7; RACC keeps its stylised large head.
ok(HEAD_BASE['589'].scale < .7 && HEAD_BASE.fk.scale < .7, '589 and Firekeepers use realistic head scale');
ok(HEAD_BASE.racc.scale > HEAD_BASE['589'].scale, 'RACC keeps a larger stylised head');
ok(HEAD_BASE.fk.neckW > HEAD_BASE['589'].neckW && HEAD_BASE.fk.jawW > HEAD_BASE['589'].jawW, 'Firekeepers get broader necks and jaws');
// Per-token traits drive the head.
const fr = head('589', p589()), surprised = head('589', p589({ Eye: 'Surprised' }));
ok(fr.lid >= .55 && fr.eyeH < 1, '589 "Fr" eye gives the narrowed hard stare');
ok(surprised.lid === 0 && surprised.eyeH > 1, '589 "Surprised" opens the eyes');
ok(head('589', p589({ Head: 'Black Burn Shiesty' })).cover === 'balaclava', 'Shiesty becomes a balaclava');
ok(head('589', p589({ Eye: 'Golden Melt Down' })).eyeStyle === 'gold-melt', 'Golden Melt Down eyes');
ok(head('589', p589({ Head: 'Burn Halo' })).bald === true, 'Burn Halo tokens are bald');
ok(head('589', p589({ Eye: 'Interesting' })).browL > 0, 'Interesting raises one brow');
const fk = t => head('fk', Object.entries(t));
ok(fk({ Head: 'Flames', Face: 'Skull' }).faceKind === 'skull', 'Firekeepers Skull face');
ok(fk({ Head: 'Flames', Face: 'Wolf' }).faceKind === 'wolf', 'Firekeepers Wolf face');
ok(fk({ Head: 'Space Helmet', Face: 'Monkey' }).cover === 'space-helmet', 'Space Helmet is not a great helm');
ok(fk({ Head: 'Helmet', Face: 'Flaming Eyes' }).cover === 'great-helm', 'Knight Helmet');
ok(fk({ Head: 'Flames', Face: 'Beard' }).jawW > HEAD_BASE.fk.jawW * .95, 'Beard keeps a broad jaw');
// Coverage: every common trait value seen in sampled real metadata (60 x 589, 22 Firekeepers) maps to a rule.
for (const v of ['Fr', 'Surprised', 'Golden Melt Down', 'Interesting', 'Burn Eyez', 'Sticky Dead']) ok(head('589', p589({ Eye: v })).matchedTraits.includes('eye:' + v.toLowerCase()), '589 Eye ' + v);
for (const v of ['Angry', 'Hmp', 'Meh', 'Smirk', 'YoLo']) ok(head('589', p589({ Mouth: v })).matchedTraits.includes('mouth:' + v.toLowerCase()), '589 Mouth ' + v);
for (const v of ['Burn Halo', 'Burn XRP Fitted', 'Black Burn Shiesty', 'MoHawk', 'Burn King Crown', 'Red Burn Shiesty', 'Space Helmet']) ok(head('589', p589({ Head: v })).matchedTraits.includes('head:' + v.toLowerCase()), '589 Head ' + v);
for (const v of ['Mask', 'Sunglasses', 'Grin', 'Beard', 'Skull', 'Tribal Tattoo', 'Lizard Tongue', 'Flaming Eyes', 'Gas Mask', 'Samurai Mask', 'Slime', 'Monkey', 'Wolf', 'Jewels']) ok(fk({ Face: v }).matchedTraits.includes('face:' + v.toLowerCase()), 'Firekeepers Face ' + v);
for (const v of ['Flames', 'Helmet', 'Crown of Flames', 'Hood', 'Flaming Dreds', 'Space Helmet', 'Crown']) ok(fk({ Head: v }).matchedTraits.includes('head:' + v.toLowerCase()), 'Firekeepers Head ' + v);
// Unknown values fall back to the collection default.
const unk = head('589', [['Eye', 'Totally New Eye'], ['Head', 'Unknown Hat']], '');
ok(unk.lid === HEAD_BASE['589'].lid && unk.cover === '' && unk.matchedTraits.length === 0, 'unknown traits fall back to the 589 default head');
// Shared base for 589 / RACC: identical traits -> identical head. Trait-fallback Firekeepers get a small seeded jitter.
const a = head('589', p589(), 'BURN-589 #0001'), b = head('589', p589(), 'BURN-589 #0002');
ok(JSON.stringify(a) === JSON.stringify(b), '589 tokens with the same traits share one look');
const fa = fk({ Head: 'Flames', Face: 'Grin' }), fb = head('fk', [['Head', 'Flames'], ['Face', 'Grin']], 'tok-2');
ok(fa.skullW !== fb.skullW || fa.jawW !== fb.jawW, 'unknown Firekeepers with identical traits are not clones');
ok(Math.abs(fa.skullW - fb.skullW) <= .07, 'Firekeeper fallback variation stays small');
ok(JSON.stringify(resolveNftHeadShape(resolveNftAvatarProfile({ key: 'fk', id: 'x', traits: [] }), { jitter: false })) === JSON.stringify(resolveNftHeadShape(resolveNftAvatarProfile({ key: 'fk', id: 'y', traits: [] }), { jitter: false })), '1/1 specs can disable the jitter');
// Firekeepers 1/1 data: one bespoke spec per minted NFTokenID.
const { FK_1OF1, firekeeperSpec } = await import('./nft-avatar-firekeepers-1of1.js');
const ids = Object.keys(FK_1OF1);
ok(ids.length === 22, 'all 22 minted Firekeepers have a 1/1 spec');
ok(ids.every(id => /^[0-9A-F]{64}$/.test(id) && id.startsWith('0008C350CBA4A5AF2A8012786865E81067D054E55EB87419')), '1/1 specs are keyed by Firekeepers NFTokenID');
ok(ids.every(id => /^(human|wolf|reptile|monkey|skull|bird|helm)$/.test(FK_1OF1[id].sculpt) && FK_1OF1[id].fidelity), 'every 1/1 picks a sculpted head and records an honest fidelity note');
ok(firekeeperSpec(ids[16].toLowerCase())?.sculpt === 'wolf' && firekeeperSpec('unknown') === null, 'lookup is case-insensitive and unknown tokens fall back');
// v121 colour pass: palettes are sampled numbers per token / trait value.
const HEX = /^#[0-9a-f]{6}$/i;
ok(ids.every(id => ['skin', 'shadow', 'accent', 'metal', 'glow'].every(k => HEX.test(FK_1OF1[id].pal?.[k] || ''))), 'every Firekeeper 1/1 stores 5 sampled key colours');
const { PAL_589_BODY, palette589, cloth589, PAL_RACC } = await import('./nft-avatar-palette.js');
ok(['flame on', 'heating up', 'about to burn', 'cool off'].every(b => HEX.test(PAL_589_BODY[b].skin) && HEX.test(PAL_589_BODY[b].shadow)), '589 Body values all have skin + shadow colours');
ok(palette589(' Flame On ') === PAL_589_BODY['flame on'] && cloth589('Blue Tee') === '#3a4b7d' && palette589('???') === null, '589 palette lookups are shared per trait value');
ok(HEX.test(PAL_RACC.skin) && HEX.test(PAL_RACC.shadow), 'RACC has a shared palette');
console.log(`NFT avatar head-shape tests passed (${checks} assertions).`);
