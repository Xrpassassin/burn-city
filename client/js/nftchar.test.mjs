import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveNftAvatarProfile } from './nft-avatar-adapters.js';

const [avatar, city, app, sw, picker, nftServer] = await Promise.all([
  readFile(new URL('./nftchar.js', import.meta.url), 'utf8'),
  readFile(new URL('./city.js', import.meta.url), 'utf8'),
  readFile(new URL('./app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('./nftpick.js', import.meta.url), 'utf8'),
  readFile(new URL('../../server/nft.js', import.meta.url), 'utf8')
]);
let checks = 0;
function has(source, pattern, message) { assert.match(source, pattern, message); checks++; }
function lacks(source, pattern, message) { assert.doesNotMatch(source, pattern, message); checks++; }


const raccProfile = resolveNftAvatarProfile({ key: 'racc', id: 'NFT-001', traits: [['Bandit Mask', 'Crimson'], ['Background', 'Sunset'], ['Fur Color', 'Silver']] });
assert.equal(raccProfile.collectionName, 'RACC'); checks++;
assert.equal(raccProfile.archetype, 'raccoon'); checks++;
assert.deepEqual(raccProfile.renderTraits, [['mask', 'Crimson'], ['background', 'Sunset'], ['fur color', 'Silver']]); checks++;
assert.deepEqual(raccProfile.rawTraits, [['Bandit Mask', 'Crimson'], ['Background', 'Sunset'], ['Fur Color', 'Silver']]); checks++;
assert.equal(raccProfile.identitySeed, resolveNftAvatarProfile({ key: 'racc', id: 'NFT-001' }).identitySeed); checks++;
assert.notEqual(raccProfile.identitySeed, resolveNftAvatarProfile({ key: 'racc', id: 'NFT-002' }).identitySeed); checks++;
const firekeeperProfile = resolveNftAvatarProfile({ key: 'fk', traits: [['Ember Type', 'Blue'], ['Keeper Robes', 'Ash']] });
assert.deepEqual(firekeeperProfile.renderTraits, [['flame', 'Blue'], ['outfit', 'Ash']]); checks++;
const protocolProfile = resolveNftAvatarProfile({ key: '589', traits: [['Loadout', 'Rifle'], ['Bling', 'Gold']] });
assert.deepEqual(protocolProfile.renderTraits, [['weapon', 'Rifle'], ['accessory', 'Gold']]); checks++;
const unknownProfile = resolveNftAvatarProfile({ key: 'future-project', traits: [['Background', 'Rain']] });
assert.equal(unknownProfile.hasCollectionAdapter, false); checks++;
assert.deepEqual(unknownProfile.rawTraits, [['Background', 'Rain']]); checks++;

has(avatar, /resolveNftAvatarProfile/, 'routes traits through collection-specific adapters');
has(avatar, /resolveNftAvatarComponents/, 'resolves typed traits into explicit visual component recipes');
has(avatar, /nft-robe-outer-layer/, 'renders a distinct Firekeepers robe layer');
has(avatar, /nft-armor-shoulder/, 'renders armor shoulder plates from outfit traits');
has(avatar, /nft-relic-accessory/, 'renders collection relic accessories');
has(avatar, /nft-earring/, 'renders earring accessories');
has(avatar, /nftAvatarProfile=.*components/, 'exposes resolved visual recipes for QA');
has(avatar, /originalTraitPairs/, 'retains original NFT traits separately from normalized render traits');
has(avatar, /nftAvatarProfile=/, 'attaches stable collection and identity metadata to the avatar');
has(avatar, /Stable, subtle silhouette variation/, 'varies each token silhouette deterministically when explicit body-shape traits are absent');
has(avatar, /hasBodyShape|hasFaceShape/, 'defers to explicit body or face shape metadata when available');
has(avatar, /export function buildNftChar/, 'exports the NFT character builder');
has(avatar, /new THREE\.SphereGeometry\(1, lite \? 10 : 16, lite \? 8 : 12\)/, 'uses smooth sphere anatomy with mobile geometry scaling');
has(avatar, /geo\('capsule:'/, 'caches shared rounded limb geometry');
has(avatar, /new THREE\.CapsuleGeometry\(r, len, cap, radial\)/, 'uses capsule limbs rather than box-shaped limbs');
has(avatar, /const torso = addCapsule/, 'uses a rounded torso silhouette');
has(avatar, /const legs = \[-1,1\]\.map/, 'builds two articulated legs');
has(avatar, /const arms = \[-1,1\]\.map/, 'builds two articulated arms');
has(avatar, /if \(key === 'racc'\)/, 'selects a dedicated RACC animal archetype');
has(avatar, /red mask/, 'supports the RACC red-mask trait');
has(avatar, /ringed tail|tail = new THREE\.Group/, 'adds a segmented raccoon tail');
has(avatar, /else \{\s*addSphere\(head,skin/, 'uses a separate human face archetype');
has(avatar, /beard\|goatee\|mustache/, 'maps facial-hair traits to the human head');
has(avatar, /white hair\|silver hair/, 'maps hair-color traits');
has(avatar, /helmet/, 'maps helmet traits');
has(avatar, /crown/, 'maps crown traits');
has(avatar, /hood/, 'maps hood traits');
has(avatar, /horn/, 'maps horn traits');
has(avatar, /sunglass\|frames\|goggle/, 'maps eyewear traits');
has(avatar, /flame\|fire\|on fire/, 'maps fire traits to visible effects');
has(avatar, /chain\|medallion\|necklace/, 'maps jewelry traits');
has(avatar, /armor\|fur\|collar\|cape/, 'maps armor, fur and cape traits');
has(avatar, /key==='589'/, 'gives 589 avatars a collection-specific BURN accent');
has(avatar, /key==='fk'/, 'gives Firekeepers a collection-specific ember treatment');
has(avatar, /nft-artwork-panel/, 'shows the complete NFT artwork on the walking avatar');
has(avatar, /nft-hair-spike/, 'renders metadata-driven mohawk and spiky hairstyles');
has(avatar, /nft-dreadlock|nft-braid/, 'renders metadata-driven locks and braids');
has(avatar, /nft-facial-scar|nft-freckle|nft-face-paint/, 'renders distinct facial markings');
has(avatar, /nft-antler|nft-horn/, 'renders horn and antler silhouettes');
has(avatar, /nft-pattern-stripe|nft-pattern-spot|nft-camouflage-patch/, 'renders metadata-driven clothing patterns');
has(avatar, /components\.facialHair/, 'uses normalized facial-hair metadata');
has(avatar, /nft-artwork-frame/, 'frames the NFT artwork as a prominent identity tabard');
has(avatar, /nftAvatarProfile=.*components/, 'exposes resolved visual recipes for QA');
has(avatar, /components\.hasMask/, 'renders trait-driven face masks on humanoid avatars');
has(avatar, /artworkIdentity=.*cropped:false/, 'exposes the original artwork identity mode and no-crop guarantee');
has(avatar, /artPanel/, 'keeps original NFT composition separate from procedural character geometry');
has(avatar, /Math\.min\(\.54\/iw,\.69\/ih\)/, 'fits the larger complete artwork composition without cropping');
has(avatar, /eyeHex = traitColor/, 'maps typed eye-color traits to eye materials');
has(avatar, /hairHex = traitColor/, 'maps typed hair-color traits to hair materials');
has(avatar, /opts\.card/, 'keeps the floating peer portrait optional');
has(avatar, /g\.userData\.anim=/, 'exposes a compatible walking animation');
has(avatar, /o\.material\.dispose\(\)/, 'disposes per-avatar mapped materials without destroying shared textures');
lacks(avatar, /o\.material\.map\.dispose\(\)/, 'does not dispose shared cached NFT textures per avatar');
has(city, /NftPick\.mount\(SRV/, 'keeps the verified NFT selection flow');
has(city, /av\.userData\.nftCharacter=myNft/, 'attaches the selected NFT model to the local city walker');
has(city, /buildNftChar\(n,\{srv:SRV,card:true,lite:/, 'uses low-cost geometry on mobile peers');
has(city, /distanceToSquared\(p\.g\.position\)<85\*85/, 'streams detailed peer avatars only near the camera');
has(city, /\?4:8/, 'caps simultaneous detailed NFT models more tightly on mobile');
has(city, /activeNftModels>=nftModelCap\(\)/, 'enforces the detailed peer model budget');
has(city, /activeNftModels=Math\.max\(0,activeNftModels-1\)/, 'releases model budget when peers leave or go out of range');
has(city, /if\(p\.boat\)\{W\(\)\.S\.remove\(p\.boat\)/, 'preserves boat cleanup from current main');
has(app, /L\.nftCharacter&&L\.nftCharacter\.userData\.anim/, 'animates the selected local NFT character');
has(sw, /bc-v100-nft-identity-fidelity/, 'bumps service-worker cache version for NFT identity geometry');
has(picker, /metaVersion: 2/, 'refreshes previously selected local NFTs to the expanded metadata schema');
has(picker, /slice\(0, 64\)/, 'persists up to 64 typed NFT attributes and values');
has(picker, /https:\/\/xrpl\.to/, 'credits the marketplace metadata enrichment source');
has(nftServer, /https:\/\/api\.xrpl\.to\/v1\/nft\//, 'queries the documented NFT-by-NFTokenID metadata endpoint');
has(nftServer, /String\(x\.NFTokenID \|\| x\._id \|\| ''\)\.toUpperCase\(\) !== id/, 'matches enrichment to the exact NFT ID');
has(nftServer, /const META_SCHEMA = 2/, 'invalidates old cached metadata schema');
has(nftServer, /slice\(0, 64\)/, 'preserves up to 64 typed traits');
has(nftServer, /model3d:/, 'retains available 3D model references');
has(nftServer, /mediaFiles:/, 'retains bounded original media-file references');
has(nftServer, /fit: 'contain'/, 'keeps the full artwork composition instead of cropping');
has(avatar, /const traitPairs =/, 'uses typed traits instead of only untyped values');
has(avatar, /traitColor =/, 'maps trait-specific colors');
lacks(avatar, /trait-background-halo|backgroundHex/, 'does not merge the NFT background into 3D geometry');
has(avatar, /Background belongs to the original 2D NFT composition/, 'keeps backgrounds attached to the original artwork composition');
has(avatar, /const mouthTrait =/, 'maps mouth and expression traits');
has(avatar, /const wingTrait=/, 'maps wing traits');
has(avatar, /const weaponTrait=/, 'maps weapon and gear traits');
has(avatar, /nftMedia=/, 'retains discovered NFT media references on the avatar');
console.log('NFT avatar architecture: ' + checks + ' assertions passed');
