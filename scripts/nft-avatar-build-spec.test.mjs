import assert from 'node:assert/strict';
import { compileNftAvatarBuildSpec } from './nft-avatar-build-spec.mjs';
let checks = 0;
function ok(v,m){assert.ok(v,m);checks++;}
function equal(a,b,m){assert.deepEqual(a,b,m);checks++;}
const racc = compileNftAvatarBuildSpec({key:'racc',id:'RACC-42',name:'Raccoon sample',img:'https://example.invalid/art.png',traits:[['Bandit Mask','Crimson'],['Ring Tail','Black and White'],['Fits','Striped Sweater'],['Mystery Rune','Gold']]});
equal(racc.specVersion,1,'spec version is explicit');
equal(racc.identity.tokenId,'RACC-42','token identity preserved');
equal(racc.identity.rawTraits.length,4,'raw traits are preserved');
equal(racc.reconstruction.archetype,'anthropomorphic-raccoon','collection recipe drives archetype');
equal(racc.reconstruction.exactReconstruction,false,'compiler does not overclaim likeness');
equal(racc.production.runtimeApproved,false,'compiled spec never approves runtime assets');
equal(racc.production.originalArtworkRequired,true,'artwork comparison is mandatory');
ok(racc.traits.normalized.some(t=>t.sourceType==='Ring Tail' && t.renderSlot==='tail'),'trait is normalized to renderer slot');
ok(racc.traits.unmapped.some(t=>t.sourceType==='Mystery Rune'),'unknown trait is surfaced for authoring');
ok(racc.production.tasks.some(t=>t.includes('SHA-256')),'build checklist requires output provenance');
const fk = compileNftAvatarBuildSpec({key:'fk',tokenId:'FK-2',traits:[['Cowl','Ash'],['Relic','Sun Sigil']]});
equal(fk.reconstruction.archetype,'firekeeper','Firekeepers recipe resolves');
ok(fk.production.targetBudgets.targetTriangles>0,'mobile target budget is present');
const unknown = compileNftAvatarBuildSpec({key:'collection-not-yet-supported',id:'X-1',traits:[]});
equal(unknown.identity.collectionKey,'generic','unsupported collection uses generic safe recipe');
equal(unknown.identity.requestedCollectionKey,'collection-not-yet-supported','original requested key remains auditable');
assert.throws(()=>compileNftAvatarBuildSpec({key:'racc',traits:[]}),/token id/);checks++;
assert.throws(()=>compileNftAvatarBuildSpec({id:'x',traits:[]}),/collection key/);checks++;
assert.throws(()=>compileNftAvatarBuildSpec({key:'racc',id:'x',traits:[['broken']]}),/pairs/);checks++;
console.log('NFT avatar build-spec compiler: '+checks+' assertions passed');
