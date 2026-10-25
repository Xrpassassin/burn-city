import assert from 'node:assert/strict';
import { canonicalTraitKey, normalizeTraitSource, safeSourceUrl, resolveSourceUrl, createTraitAssetRegistry, canEquipTrait, validateCollectionInventory, buildTraitAssemblyManifest, normalizeCollectionTraits } from './nft-trait-asset-registry.mjs';
const a = 'A'.repeat(64), b = 'B'.repeat(64);
assert.equal(canonicalTraitKey({collection:'RACC',type:'Top Gear',value:'Straw Hat'}), canonicalTraitKey({collection:'racc',type:'top gear',value:'straw hat'}));
assert.throws(() => normalizeTraitSource({collection:'RACC',tokenId:'bad',type:'hat',value:'straw'}));
assert.equal(safeSourceUrl('javascript:alert(1)'), '');
assert.equal(safeSourceUrl('ipfs://bafybeih/example.png'), 'ipfs://bafybeih/example.png');
assert.equal(resolveSourceUrl('ipfs://bafybeih/example.png','https://gateway.example'), 'https://gateway.example/ipfs/bafybeih/example.png');
const registry = createTraitAssetRegistry({
 allowedCollections:['racc','589','firekeepers'],
 assets:[{id:'racc-straw-hat-v1',collection:'racc',type:'Top Gear',value:'Straw Hat',slot:'headwear',rigFamilies:['anthropomorphic-raccoon'],sourceTokenIds:[a],sourceArtworkUrls:['ipfs://bafybeih/source.png'],modelRef:'models/racc-straw-hat.glb',materialRef:'materials/straw.json',provenance:'xrp.cafe reference',rightsStatus:'approved',visualApproval:'approved',version:1}],
 sources:[{collection:'racc',tokenId:a,type:'Top Gear',value:'Straw Hat',sourceUrl:'https://xrp.cafe/nft/1',provenance:'xrp.cafe'},{collection:'racc',tokenId:b,type:'Top Gear',value:'Straw Hat',sourceUrl:'https://xrp.cafe/nft/2',provenance:'xrp.cafe'},{collection:'unknown',tokenId:a,type:'Top Gear',value:'Straw Hat'}]
});
const hat = registry.get({collection:'RACC',type:'top gear',value:'straw hat'});
assert.equal(hat.id,'racc-straw-hat-v1');
assert.equal(registry.getSources({collection:'racc',type:'top gear',value:'straw hat'}).length,2);
assert.equal(registry.issues.some(i => i.code === 'UNAPPROVED_SOURCE_COLLECTION'),true);
const char = {rigFamily:'anthropomorphic-raccoon',collection:'racc',supportedSlots:['headwear']};
assert.equal(canEquipTrait(hat,char).ok,true);
assert.equal(canEquipTrait(hat,{...char,rigFamily:'humanoid-robed',collection:'firekeepers'}).reason,'collection-mismatch');
assert.equal(canEquipTrait({...hat,compatibility:[]},{...char,collection:'589'}).reason,'collection-mismatch');
const manifest = buildTraitAssemblyManifest({collection:'racc',traits:[{type:'Top Gear',value:'Straw Hat'},{type:'Armed',value:'TNT'},{type:'Fits',value:'Yellow Striped Sweater'}],registry,character:char});
assert.equal(manifest.totalTraits,3);
assert.equal(manifest.readyTraits,1);
assert.equal(manifest.entries[0].status,'ready');
assert.equal(manifest.entries[1].reason,'trait-asset-not-found-in-collection');
assert.equal(manifest.entries[2].status,'missing-asset');
const wrongCollectionManifest = buildTraitAssemblyManifest({collection:'589',traits:[{type:'Top Gear',value:'Straw Hat'}],registry,character:{rigFamily:'humanoid',supportedSlots:['headwear']}});
assert.equal(wrongCollectionManifest.entries[0].status,'missing-asset');
assert.equal(canEquipTrait({...hat,visualApproval:'not-reviewed'},char).reason,'trait-visual-not-approved');
assert.equal(canEquipTrait({...hat,rightsStatus:'unverified'},char).reason,'trait-rights-not-approved');
assert.equal(validateCollectionInventory({collection:'racc',expectedCount:2,tokens:[{NFTokenID:a},{NFTokenID:b}]}).complete,true);
assert.equal(validateCollectionInventory({collection:'racc',expectedCount:3,tokens:[{NFTokenID:a},{NFTokenID:a}]}).complete,false);
assert.equal(validateCollectionInventory({collection:'racc',expectedCount:1,tokens:[{NFTokenID:a}],pageErrors:[{code:'api-failure'}]}).complete,false);

const raccManifest = { collectionKey:'racc', traitMappings:[{slot:'headwear',aliases:['Top Gear']},{slot:'weapon',aliases:['Armed']},{slot:'outfit',aliases:['Fits']}] };
const raccNormalized = normalizeCollectionTraits({collectionManifest:raccManifest,traits:[{type:'Top Gear',value:'RACC Lee Hat'},{trait_type:'Armed',value:'TNT'},{type:'Fits',value:'Yellow Striped Sweater'},{type:'Suit Type',value:'Streetwear'}]});
assert.deepEqual(raccNormalized.map(t=>t.slot),['headwear','weapon','outfit','']);
assert.equal(raccNormalized[0].type,'Top Gear');
assert.equal(raccNormalized[3].mapped,false,'does not borrow a 589-only alias into RACC');
assert.throws(()=>normalizeCollectionTraits({collectionManifest:{collectionKey:'racc',traitMappings:[{slot:'headwear',aliases:['Head']},{slot:'weapon',aliases:['head']}]},traits:[]}),/ambiguous trait alias/);
console.log('NFT trait asset registry and assembly manifest tests passed');
