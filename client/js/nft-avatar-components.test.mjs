import assert from 'node:assert/strict';
import { resolveNftAvatarProfile } from './nft-avatar-adapters.js';
import { resolveNftAvatarComponents } from './nft-avatar-components.js';
let checks = 0;
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function yes(value, message) { assert.ok(value, message); checks++; }
const racc = resolveNftAvatarComponents(resolveNftAvatarProfile({ key:'racc', id:'racc-test', traits:[['Ring Tail','Black and White'],['Bandit Mask','Crimson'],['Fur Color','Silver']] }));
eq(racc.collectionKey,'racc','retains collection key'); eq(racc.tailStyle,'ringed','recognizes ring-tail variants'); eq(racc.hasMask,true,'recognizes collection mask'); eq(racc.rawTraitCount,3,'retains raw trait count');
const fire = resolveNftAvatarComponents(resolveNftAvatarProfile({ key:'fk', id:'fk-test', traits:[['Ember Type','Blue Flame'],['Keeper Robes','Ash'],['Cowl','Ember Cowl'],['Relic','Sun Sigil']] }));
eq(fire.flame.style,'blue','maps blue flame variant'); eq(fire.flame.color,'#4bc9ef','maps explicit flame color'); eq(fire.outfitStyle,'robes','maps robes to robe recipe'); eq(fire.headwearStyle,'hood','maps cowl to hood recipe'); eq(fire.accessoryStyle,'relic','maps relic to relic recipe');
const protocol = resolveNftAvatarComponents(resolveNftAvatarProfile({ key:'589', id:'589-test', traits:[['Suit Type','Tailored Suit'],['Headgear Type','Cyber Helmet'],['Loadout','Rifle'],['Bling','Gold Chain'],['Eye Color','Neon Blue']] }));
eq(protocol.outfitStyle,'tailored','maps suit to tailored recipe'); eq(protocol.headwearStyle,'helmet','maps headgear to helmet recipe'); eq(protocol.weaponStyle,'firearm','maps loadout to firearm prop'); eq(protocol.accessoryStyle,'chain','maps bling to chain'); eq(protocol.eyeStyle,'glowing','maps neon eyes to glowing style');
const generic = resolveNftAvatarComponents(resolveNftAvatarProfile({ key:'unknown', traits:[['Wings','Mechanical'],['Weapon','Katana'],['Expression','Smile']] }));
eq(generic.wingStyle,'mechanical','supports mechanical wing style'); eq(generic.weaponStyle,'blade','supports blade props'); eq(generic.expression,'friendly','maps friendly expression');
const detailProfile = resolveNftAvatarProfile({ key:'589', id:'detail-test', traits:[['Hair Style','Mohawk'],['Facial Hair','Goatee'],['Face Paint','War Paint'],['Body Pattern','Camouflage'],['Horns','Antlers']] });
const detail = resolveNftAvatarComponents(detailProfile);
eq(detail.hairStyle,'mohawk','maps mohawk hairstyle');
eq(detail.facialHair,'Goatee','preserves typed facial-hair style');
eq(detail.hasMarkings,true,'maps face paint to markings');
eq(detail.patternStyle,'camouflage','maps camouflage body pattern');
eq(detail.hasHorns,true,'maps antler traits');
const hairColorProfile = resolveNftAvatarProfile({ key:'589', traits:[['Hair','Silver']] });
eq(hairColorProfile.renderTraits[0][0],'hair','does not misclassify ambiguous Hair as a hairstyle');
const empty = resolveNftAvatarComponents({}); eq(empty.headwearStyle,'none','handles missing profile'); eq(empty.weaponStyle,'none','does not invent weapon'); yes(!empty.hasMask,'empty profile has no mask');
console.log('NFT avatar component recipes: '+checks+' assertions passed');
