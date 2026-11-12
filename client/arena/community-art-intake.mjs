// User-approved community asset intake for BURN City (2026-11-11).
// `installed` stays false until a REAL locally vendored GLB has passed
// SHA-256, license, skeleton, clip and WebGL quality gates. No hotlinked GLBs,
// remote embed scripts, browser tokens or automatic network downloads.
const entry=(id,mode,file,source,creator,triangles,additional={})=>
 Object.freeze({id,mode,file,source,creator,license:'CC-BY-4.0',triangles,
  installed:false,sha256:null,...additional});
export const COMMUNITY_ART=Object.freeze([
 entry('homefront-male-survivor','homefront','homefront-male-survivor.glb',
  'https://sketchfab.com/3d-models/3d-zombie-apocalypse-survivor-male-character-f56ffc64d18c40cf95d17559542ca44c',
  'codersan',10000,{purpose:'temporary_player',rigged:true,animationRequired:true,installed:true,sha256:'3b1abfcbcc79f3f24097587f94284152e053e0df9db9a5aab42b2a7ab84b0c3f'}),
 entry('street-props-pack','homefront','homefront-street-props.glb',
  'https://sketchfab.com/3d-models/pbr-street-props-pack-game-ready-8013d8e6af4645d1a7c3d5b24054bfc8',
  'MadeByYeshe',20700,{purpose:'world_props',downloadSource:'https://crazydrpants.itch.io/street-props-pack',installed:true,sha256:'30b97656624cb6596495b7aa343f87c42c01124717cdb0975fdde0fcf7edf332'}),
 entry('abandoned-garage','homefront','homefront-garage.glb',
  'https://sketchfab.com/3d-models/abandoned-garage-block-rusty-ruined-game-ready-a1959927a98e4752bdb01b6e1f7f7d26',
  'olegolegperepelica',8400,{purpose:'freight_depot'}),
 entry('military-control','homefront','homefront-military-control.glb',
  'https://sketchfab.com/3d-models/military-control-building-game-ready-2bff5075256e4370b93ad58237567008',
  'AVALMesh',3100,{purpose:'road_checkpoint'}),
 entry('mutant-nurse','zombies','zombie-mutant-nurse.glb',
  'https://sketchfab.com/3d-models/horror-mutant-bloody-nurse-gore-rigged-2bc6e1cac98e458a824691009ef2433c',
  'KrimzonHaze',27000,{purpose:'boss_skin',rigged:true,zombieType:8,targetHeight:1.9}),
 entry('living-flesh-blob','zombies','zombie-flesh-blob.glb',
  'https://sketchfab.com/3d-models/living-flesh-blob-free-organic-horror-asset-6357bbc094d54cf5ba150ef2951b3750',
  'Yury Misiyuk',9900,{purpose:'crawler_skin',rigged:true,zombieType:5,targetHeight:0.95})
]);
export const communityArtById=id=>COMMUNITY_ART.find(spec=>spec.id===id)||null;
export function enabledCommunityArt(mode,entries=COMMUNITY_ART){
 return entries.filter(spec=>spec.mode===mode&&spec.installed===true&&
  /^[0-9a-f]{64}$/.test(spec.sha256||'')&&
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/.test(spec.file));
}
export function verifyCommunitySpec(spec){
 if(!spec||!['homefront','zombies'].includes(spec.mode)||
   !/^https:\/\/sketchfab\.com\/3d-models\//.test(spec.source)||
   spec.license!=='CC-BY-4.0'||!Number.isFinite(spec.triangles)||spec.triangles<100)return false;
 return spec.installed!==true || (enabledCommunityArt(spec.mode,[spec]).length===1);
}
