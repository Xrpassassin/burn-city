import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from './vendor/three.module.min.js';
import {COMMUNITY_ART,communityArtById,enabledCommunityArt,verifyCommunitySpec} from './community-art-intake.mjs';
import {enabledZombieSpecials,zombieSpecialModelForType,zombieSpecialClipAliases,zombieSpecialModelHeight} from './zombie-special-art.mjs';
import {createHomefrontCommunityArt,homefrontAssetQuality,communityPropNameMatches,HOMEFRONT_COMMUNITY_LANDMARKS,HOMEFRONT_COMMUNITY_PROP_SITES,HOMEFRONT_COMMUNITY_MOBILE_PROP_SITES} from './homefront-community-art.mjs';
import {inPineCrossing,pineRouteDistance,PINE_CROSSING_BUILDINGS,PINE_ROADSIDE_SITES} from './homefront-pine-crossing.mjs';

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
assert.deepEqual(enabledCommunityArt('homefront').map(x=>x.id),
 ['homefront-male-survivor','street-props-pack'],
 'temporary artist-licensed hero and actual vendored street GLB must be verified');
const heroProof=JSON.parse(readFileSync(new URL('./assets/community/homefront-survivor-verified.json',import.meta.url),'utf8'));
assert.equal(heroProof.creator,'codersan');
assert.equal(heroProof.triangles,10000);
assert.equal(heroProof.sourceArchiveSha256,'f8c7d876b2386a5ad08d2fb1ca168906e3c342a31f6724f36ccb140d0d3e299a');
assert.equal(heroProof.sha256,communityArtById('homefront-male-survivor').sha256);
assert.match(heroProof.motionSource,/Original/);
const heroBytes=readFileSync(new URL('./assets/community/homefront-male-survivor.glb',import.meta.url));
const heroDoc=JSON.parse(heroBytes.toString('utf8',20,20+heroBytes.readUInt32LE(12)));
assert.equal(heroDoc.skins.length,1);
assert.equal(heroDoc.images.length,1);
for(const action of ['Idle','Idle2','Idle3','Walk','Run','Jump'])
 assert(heroDoc.animations.some(a=>a.name===action),'temporary hero must have real '+action+' animation');
assert(heroDoc.animations.find(a=>a.name==='Run').channels.length>=10);
assert(heroDoc.animations.find(a=>a.name==='Walk').channels.length>=10);
assert.equal(enabledCommunityArt('zombies').length,0,'original Zombies must keep its proven GLB trio');

const streetManifest=JSON.parse(readFileSync(new URL('./assets/community/street-props-acquisition.json',import.meta.url),'utf8'));
assert.equal(streetManifest.status,'ACQUIRED_NOT_ENABLED','audit manifest preserves the pre-approval acquisition state');
assert.equal(streetManifest.sha256,communityArtById('street-props-pack').sha256,'catalog activation must be anchored to actual imported GLB checksum');
assert.equal(streetManifest.triangles,20667,'the downloaded archive was inspected, not only the source listing');
const streetBytes=readFileSync(new URL('./assets/community/homefront-street-props.glb',import.meta.url));
const streetJsonLength=streetBytes.readUInt32LE(12);
assert.equal(streetBytes.readUInt32LE(16),0x4e4f534a);
const streetDocument=JSON.parse(streetBytes.toString('utf8',20,20+streetJsonLength));
const streetNodes=streetDocument.nodes.map(n=>n.name||'').filter(Boolean);
assert.equal(streetDocument.meshes.length,56,'real street pack GLB contains 56 individually named mesh primitives');
assert.equal(streetDocument.materials.length,38,'original creator PBR material diversity is retained');
for(const image of streetDocument.images||[])
 assert(Number.isInteger(image.bufferView)||String(image.uri||'').startsWith('data:'),
   'creator GLB must bundle every texture rather than silently 404 on remote/relative image URLs');
for(const primitive of streetDocument.meshes.flatMap(m=>m.primitives||[]))
 assert(primitive.attributes?.POSITION!==undefined,'all imported street props must have position geometry');
assert.deepEqual(streetNodes,streetManifest.names,'author-provided names are checked against the real binary rather than trusted from a JSON record');
const streetKinds=[...new Set(HOMEFRONT_COMMUNITY_PROP_SITES.map(x=>x.kind))];
assert.equal(streetKinds.length,6,'six distinct street prop families are authored');
for(const kind of streetKinds)
 assert(communityPropNameMatches(kind,streetNodes),'actual bundled GLB must contain matched '+kind+' submesh');
assert.equal(communityPropNameMatches('streetlight',['Completely Unrelated Mesh']),false);
const pineStreetSites=HOMEFRONT_COMMUNITY_PROP_SITES.filter(site=>site.area==='pine-crossing');
assert.equal(pineStreetSites.length,6,'all six licensed street prop families now appear beside Pine Crossing Main Street');
assert.equal(new Set(pineStreetSites.map(site=>site.kind)).size,6);
assert.equal(HOMEFRONT_COMMUNITY_MOBILE_PROP_SITES.length,6,'phones retain six low-cost real street props');
assert.equal(new Set(HOMEFRONT_COMMUNITY_MOBILE_PROP_SITES.map(site=>site.kind)).size,6,
 'phones still see all six licensed prop families instead of only dumpsters');
assert.equal(HOMEFRONT_COMMUNITY_MOBILE_PROP_SITES.filter(site=>site.area==='pine-crossing').length,4,
 'mobile scenery must include the opening town and also the wider open world');
for(const site of pineStreetSites){
 assert(inPineCrossing(site.x,site.z),'town props must actually be inside Pine Crossing');
 assert(pineRouteDistance(site.x,site.z)>1.2,'street dressing must not obstruct the paved road or trail: '+site.kind);
 assert(PINE_CROSSING_BUILDINGS.every(building=>Math.hypot(site.x-building.x,site.z-building.z)>5.3),
  'the general store and clinic entrance approach must remain clear: '+site.kind);
 assert(PINE_ROADSIDE_SITES.every(solid=>
   Math.abs(site.x-solid.x)>solid.halfX+1.1||Math.abs(site.z-solid.z)>solid.halfZ+1.1),
  'real street models must not overlap existing authoritative solid obstacles: '+site.kind);
}


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
const unused=createHomefrontCommunityArt({specs:[],loader:{loadAsync(){attemptedFetch++;throw Error('unexpected remote fetch')}}});
await unused.load();
assert.equal(attemptedFetch,0,'no third-party binary fetch when not installed');
assert.deepEqual(unused.attachWorld({landmarks:[],landmarkSetPieces:new Map(),cityChunkAt(){throw Error('unexpected chunk')},terrainElevation:()=>0}),{replaced:0,props:0});
const installed=createHomefrontCommunityArt({specs:[spec],cloneModel:scene=>scene.clone(true),loader:{loadAsync(url){assert(url.endsWith('/assets/community/'+spec.file));return Promise.resolve({scene:body,animations:[]})}}});
await installed.load();
const existing=new THREE.Group();existing.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));
const landmarks=[{id:'test-checkpoint',archetype:'road_checkpoint'}];
const installedArt=installed.attachWorld({landmarks,landmarkSetPieces:new Map([['test-checkpoint',existing]]),cityChunkAt(){throw Error('unexpected streets')},terrainElevation:()=>0});
assert.deepEqual(installedArt,{replaced:1,props:0});
assert.equal(existing.children[0].visible,false,'replace model art, not authoritative site');
assert.equal(existing.children.at(-1).userData.cosmeticNoCollision,true);
assert.equal(existing.userData.communityArt,'military-control');

const replacedGeometry=existing.children.at(-1);
const replacedBounds=new THREE.Box3().setFromObject(replacedGeometry,true);
assert(Math.abs(replacedBounds.getCenter(new THREE.Vector3()).x)<.01 &&
 Math.abs(replacedBounds.getCenter(new THREE.Vector3()).z)<.01,
 'landmark imported mesh must be centered at the existing authored POI');
assert(Math.abs(replacedBounds.min.y)<.01,
 'normalization must floor the imported landmark without changing its collision footprint');

// Original artist meshes may sit far away in a single GLB pack scene.
// Fitting one individually must retain the source transform and normalize
// its world bounds to the authored roadside site, rather than subtracting
// its position twice.
const fakeStreet=new THREE.Group();
for(const [i,name] of ['Big Bin Body','Red Trash Can','Wood Bench','Concrete Barrier','Street Light','Bag 1'].entries()){
 const part=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
 part.name=name.replaceAll(' ','_');part.userData.name=name; // GLTFLoader's name sanitization behavior
 part.position.set(25+i*4,4,-17-i*2);fakeStreet.add(part);
}
const fakeStreetSpec={...communityArtById('street-props-pack')};
const fakeStreetLoader={loadAsync(url){
 assert(url.endsWith('/assets/community/homefront-street-props.glb'));
 return Promise.resolve({scene:fakeStreet,animations:[]});
}};
const streetAdapter=createHomefrontCommunityArt({
 specs:[fakeStreetSpec],cloneModel:object=>object.clone(true),loader:fakeStreetLoader,mobile:true
});
await streetAdapter.load();
const roadside=new THREE.Group();
const streetResult=streetAdapter.attachWorld({
 landmarks:[],landmarkSetPieces:new Map(),
 cityChunkAt(){return roadside},terrainElevation(){return 0}
});
assert.deepEqual(streetResult,{replaced:0,props:6},'mobile places six distinct street prop types');
assert.equal(roadside.children.length,6);
for(const [i,visual] of roadside.children.entries()){
 const site=HOMEFRONT_COMMUNITY_MOBILE_PROP_SITES[i];
 const bounds=new THREE.Box3().setFromObject(visual,true);
 const center=bounds.getCenter(new THREE.Vector3());
 assert(Math.abs(center.x-site.x)<.05 && Math.abs(center.z-site.z)<.05,
   'individually imported '+site.kind+' must be centered where its author-chunk site was declared');
 assert(Math.abs(bounds.min.y)<.05,'street prop model should rest on ground after normalization');
 const originalClone=visual.children[0]?.children[0];
 assert(originalClone?.position.x>=25,'the original GLB node transform is preserved under a normalization wrapper');
}

const desktopAdapter=createHomefrontCommunityArt({
 specs:[fakeStreetSpec],cloneModel:object=>object.clone(true),loader:fakeStreetLoader,mobile:false
});
await desktopAdapter.load();
const allRoadside=new THREE.Group();
const desktopResult=desktopAdapter.attachWorld({
 landmarks:[],landmarkSetPieces:new Map(),
 cityChunkAt(){return allRoadside},terrainElevation(){return 0}
});
assert.equal(desktopResult.props,HOMEFRONT_COMMUNITY_PROP_SITES.length,
 'desktop receives licensed urban and Pine Crossing street scenery without redundant model downloads');
assert.equal(allRoadside.children.length,HOMEFRONT_COMMUNITY_PROP_SITES.length);
assert(HOMEFRONT_COMMUNITY_LANDMARKS.length===2&&HOMEFRONT_COMMUNITY_PROP_SITES.length>=8);
const pilot=readFileSync(new URL('./zombie-model-pilot.mjs',import.meta.url),'utf8');
assert(pilot.includes('zombieSpecialModelForType')&&pilot.includes('createZombieInstancedLOD'));
assert(!pilot.includes("from './homefront-community-art.mjs'"),'original Zombies must not import Homefront artwork');
const world=readFileSync(new URL('./homefront-graveyard-3d.js',import.meta.url),'utf8');
const refuge=readFileSync(new URL('./homefront.html',import.meta.url),'utf8');
assert(world.includes('communityArt.decorateExplorer'));
assert(world.includes('communityArt.animateExplorer'));
assert(world.includes('communityArt.clearActors'));
assert(world.includes('nft:isLocalPlayer?NftPick.current():null'),
 'Graveyard must keep the selected NFT look instead of the licensed survivor');
assert(refuge.includes('communityArt.decorateExplorer'));
assert(refuge.includes('communityArt.animateExplorer'));
assert(refuge.includes('NftPick.current()'),
 'Refuge must reuse the City NFT picker for the local player');
assert(refuge.includes('homefront-credits.html'),'Refuge surfaces the in-game credits list');
const credits=readFileSync(new URL('./homefront-credits.html',import.meta.url),'utf8');
assert(credits.includes('codersan'));
assert(credits.includes('https://sketchfab.com/3d-models/3d-zombie-apocalypse-survivor-male-character-f56ffc64d18c40cf95d17559542ca44c'));
assert(credits.includes('https://creativecommons.org/licenses/by/4.0/'));
assert(credits.includes('CC BY 4.0'));
const lobby=readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert(lobby.includes('homefront-credits.html'),'arena lobby links the Homefront credits list');
assert(!existsSync(new URL('../../.github/workflows/homefront-survivor-pilot-vendor.yml',import.meta.url)),
 'branch-only vendor workflow must not remain after the asset is staged');
console.log('Community model intake passed: 6 sources, licensed hero GLB with original Walk/Run/Jump, 1 credited street pack, Refuge+NFT wiring, credits, missing-asset fallbacks and Zombies isolation');
