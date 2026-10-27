import assert from 'node:assert/strict';
import { resolveNftAvatarProfile } from './nft-avatar-adapters.js';
import { resolveNftAvatarReconstruction, NFT_AVATAR_RECONSTRUCTION_COLLECTIONS } from './nft-avatar-reconstruction.js';

let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function ok(value, message) { assert.ok(value, message); checks++; }

equal(NFT_AVATAR_RECONSTRUCTION_COLLECTIONS, ['589', 'racc', 'fk', 'generic'], 'exposes supported blueprint keys in stable order');
const racc = resolveNftAvatarReconstruction(resolveNftAvatarProfile({key:'racc',id:'RACC-001',traits:[['Armed','TNT'],['Fits','Sweater']]}));
equal(racc.archetype,'anthropomorphic-raccoon','RACC gets an animal-specific reconstruction');
equal(racc.silhouetteTags,['rounded-raccoon-skull','eye-mask','muzzle','ringed-tail'],'RACC silhouette includes its defining anatomy');
equal(racc.traitOverrides.originalArtworkRequired,true,'retains full original art as identity ground truth');
equal(racc.exactReconstruction,false,'does not overclaim exact reconstruction');

const fk = resolveNftAvatarReconstruction(resolveNftAvatarProfile({key:'fk',id:'FK-001',traits:[['Keeper Robes','Ash']]}));
equal(fk.archetype,'firekeeper','Firekeepers get their own reconstruction archetype');
equal(fk.traitOverrides.robe,true,'Firekeepers receive layered robe silhouette');
equal(fk.traitOverrides.hood,false,'Firekeepers without a cowl trait do not receive invented headwear');
const fkWithCowl = resolveNftAvatarReconstruction(resolveNftAvatarProfile({key:'fk',id:'FK-002',traits:[['Cowl','Ash']]}));
equal(fkWithCowl.traitOverrides.hood,true,'Firekeepers receive a cowl when the individual NFT trait specifies one');
equal(fk.traitOverrides.fire,true,'Firekeepers retain ember identity with sparse metadata');

const protocol = resolveNftAvatarReconstruction(resolveNftAvatarProfile({key:'589',id:'589-001',traits:[['Clothing','Punk Burner']]}));
equal(protocol.archetype,'burn-protocol-humanoid','589 Protocol gets a distinct humanoid blueprint');
equal(protocol.silhouetteTags,['streetwear','trait-gated-burn-insignia','trait-gated-chain','trait-gated-tech-gear'],'589 optional signature details are explicitly trait-gated');
ok(protocol.shoulderSpan > racc.shoulderSpan,'589 silhouette is broader at the shoulders than RACC');
ok(protocol.fidelityMode === 'procedural-collection-specific','labels current fidelity level accurately');

const unknown = resolveNftAvatarReconstruction(resolveNftAvatarProfile({key:'unmapped'}));
equal(unknown.archetype,'humanoid','unknown collections safely fall back to generic');
equal(unknown.collectionKey,'generic','unknown key does not select a known collection blueprint');
equal(unknown.traitOverrides.originalArtworkRequired,true,'generic fallback still preserves source art');
console.log('NFT avatar collection reconstruction: '+checks+' assertions passed');
