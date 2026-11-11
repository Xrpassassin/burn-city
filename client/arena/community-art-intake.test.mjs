import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from './vendor/three.module.min.js';
import {COMMUNITY_ART,communityArtById,enabledCommunityArt,verifyCommunitySpec} from './community-art-intake.mjs';
import {enabledZombieSpecials,zombieSpecialModelForType,zombieSpecialClipAliases,zombieSpecialModelHeight} from './zombie-special-art.mjs';
import {createHomefrontCommunityArt,homefrontAssetQuality,HOMEFRONT_COMMUNITY_LANDMARKS,HOMEFRONT_COMMUNITY_PROP_SITES} from './homefront-community-art.mjs';

assert.equal(COMMUNITY_ART.length,6,'all six explicitly selected community models have intake records');
assert.equal(new Set(COMMUNITY_ART.map(a=>a.id)).size,6);
assert(COMMUNITY_ART.every(verifyCommunitySpec),'all source provenance and licenses are explicit');
assert.equal(communityArtById('mutant-nurse').creator,'KrimzonHaze');
assert.equal(communityArtById('living-flesh-blob').creator,'Yury Misiyuk');
assert.equal(communityArtById('homefront-male-survivor').rigged,true);
assert.equal(communityArtById('street-props-pack').downloadSource,'https://crazydrpants.itch.io/street-props-pack');
for(const spec of COMMUNITY_ART){
 const file=new URL('./assets/community/'+spec.file,import.meta.url);
 if(spec.installed===true){
  assert(existsSync(file),'installed 3D assets must actually be bundled: '+spec.id);
  assert(/^[0-9a-f]{64}$/.test(spec.sha256),'bundled GLBs need audited hashes');
  const bytes=readFileSync(file);
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256);
 }else{
  assert.equal(spec.sha256,null,'unapproved downloads must not carry false hashes');
 }
}
assert.equal(enabledCommunityArt('homefront').length,0,'never fetch absent 3D models by default');
assert.equal(enabledCommunityArt('zombies').length,0,'original Zombies must keep its proven GLB trio');
const pretend=[{...communityArtById('mutant-nurse'),installed:true,sha256:'a'.repeat(64)},
 {...communityArtById('living-flesh-blob'),installed:true,sha256:'b'.repeat(64)}];
assert.deepEqual(enabledZombieSpecials(pretend).map(x=>x.id),['mutant-nurse','living-flesh-blob']);
assert.equal(zombieSpecialModelForType(8,enabledZombieSpecials(pretend)),'mutant-nurse');
assert.equal(zombieSpecialModelForType(5,enabledZombieSpecials(pretend)),'living-flesh-blob');
for(let i=0;i<9;i++)if(i!==5&&i!==8)assert.equal(zombieSpecialModelForType(i,enabledZombieSpecials(pretend)),null);
const nurse=zombieSpecialClipAliases(pretend[0],['Idle','WalkCycle','Slashing','Fall']);
assert.equal(nurse.get('Walk'),'WalkCycle');
assert.equal(nurse.get('Idle_Attack'),'Slashing');
assert.equal(nurse.get('Death'),'Fall');
const blob=zombieSpecialClipAliases(pretend[1],['Flesh_Pulse']);
for(const role of ['Idle','Walk','Run','Idle_Attack'])assert.equal(blob.get(role),'Flesh_Pulse');
assert.equal(zombieSpecialClipAliases(pretend[0],[]).size,0,'unanimated nurse needs animation retargeting before launch');
assert.equal(zombieSpecialModelHeight(pretend[1],1.7),.95);

const body=new THREE.Group();
const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());
mesh.position.y=1;body.add(mesh);
const spec={...COMMUNITY_ART[3],installed:true,sha256:'c'.repeat(64)};
assert(homefrontAssetQuality({scene:body,animations:[]},spec).valid);
assert.equal(homefrontAssetQuality({scene:new THREE.Group(),animations:[]},spec).reason,'mesh_budget');
const notRigged={...communityArtById('homefront-male-survivor')};
assert.equal(homefrontAssetQuality({scene:body,animations:[]},notRigged).reason,'missing_skeleton');

let attemptedFetch=0;
const unused=createHomefrontCommunityArt({loader:{loadAsync(){attemptedFetch++;throw Error('unexpected remote fetch')}}});
await unused.load();
assert.equal(attemptedFetch,0,'no third-party binary fetch when not installed');
assert.deepEqual(unused.attachWorld({landmarks:[],landmarkSetPieces:new Map(),cityChunkAt(){throw Error('unexpected chunk')},terrainElevation:()=>0}),{replaced:0,props:0});
const installed=createHomefrontCommunityArt({specs:[spec],loader:{loadAsync(url){assert(url.endsWith('/assets/community/'+spec.file));return Promise.resolve({scene:body,animations:[]})}}});
await installed.load();
const existing=new THREE.Group();existing.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));
const landmarks=[{id:'test-checkpoint',archetype:'road_checkpoint'}];
const installedArt=installed.attachWorld({landmarks,landmarkSetPieces:new Map([['test-checkpoint',existing]]),cityChunkAt(){throw Error('unexpected streets')},terrainElevation:()=>0});
assert.deepEqual(installedArt,{replaced:1,props:0});
assert.equal(existing.children[0].visible,false,'replace model art, not authoritative site');
assert.equal(existing.children.at(-1).userData.cosmeticNoCollision,true);
assert.equal(existing.userData.communityArt,'military-control');
assert(HOMEFRONT_COMMUNITY_LANDMARKS.length===2&&HOMEFRONT_COMMUNITY_PROP_SITES.length>=8);
const pilot=readFileSync(new URL('./zombie-model-pilot.mjs',import.meta.url),'utf8');
assert(pilot.includes('zombieSpecialModelForType')&&pilot.includes('createZombieInstancedLOD'));
assert(!pilot.includes("from './homefront-community-art.mjs'"),'original Zombies must not import Homefront artwork');
const world=readFileSync(new URL('./homefront-graveyard-3d.js',import.meta.url),'utf8');
assert(world.includes('communityArt.decorateExplorer'));
assert(world.includes('communityArt.animateExplorer'));
assert(world.includes('communityArt.clearActors'));
console.log('Community model intake passed: 6 sources, CC BY, disabled-until-installed, no hotlinks, original Zombies fallback, Homefront military rendering test');
