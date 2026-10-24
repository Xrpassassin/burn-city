import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
has(avatar, /nft-artwork-medallion/, 'overlays the actual NFT art on the character');
has(avatar, /new THREE\.CircleGeometry\(\.102,28\)/, 'uses a circular image medallion instead of a square chest slab');
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
has(sw, /bc-v94-nftavatars/, 'bumps service-worker cache version for avatar assets');
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
has(avatar, /trait-background-halo/, 'represents background traits in the 3D scene');
has(avatar, /const mouthTrait =/, 'maps mouth and expression traits');
has(avatar, /const wingTrait=/, 'maps wing traits');
has(avatar, /const weaponTrait=/, 'maps weapon and gear traits');
has(avatar, /nftMedia=/, 'retains discovered NFT media references on the avatar');
console.log('NFT avatar architecture: ' + checks + ' assertions passed');
