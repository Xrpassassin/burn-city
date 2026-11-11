// Original Arena Zombies: explicitly credited real human infected model roster.
// These are physical GLB filenames, not Sketchfab private download endpoints.
// Never load Homefront's zombies or cartoon/skeletal Storm Apocalypse demos.
export const ZOMBIE_SKETCHFAB_MODELS = Object.freeze([
 Object.freeze({
  id:'human',
  file:'zombie-human-aiden.glb',
  author:'Aiden Studios',
  source:'https://sketchfab.com/3d-models/zombie-rigged-animated-131688807ad444609ed9b2ed572dc4aa',
  license:'CC-BY-4.0',
  roles:Object.freeze({
   Idle:['Idle'], Walk:['Walk1'], Run:['Walk1'], Idle_Attack:['Attack1.001'],
   HitReact:['HitReact','Hit'], Death:['Death']
  })
 }),
 Object.freeze({
  id:'hazmat',
  file:'zombie-hazmat-licensed.glb',
  author:'LxNazarov',
  source:'https://sketchfab.com/3d-models/zombie-hazmat-49b3b4307f6a4d2386fdb02354158d04',
  license:'CC-BY-4.0',
  inPlaceClip:'Zombie_Walk_Root',
  roles:Object.freeze({
   Idle:['Zombie_Idle'],Walk:['Zombie_Walk_Root'],
   Run:['Zombie_Walk_Root'],Idle_Attack:['Zombie_Skill'],
   HitReact:['Zombie_Hit','HitReact'],Death:['Death']
  })
 })
]);

export function modelKindForEnemy(z) {
 // Variety without modifying ANY server type, damage, pursuit or spawn rules.
 // Hazard suits accompany heavily armored/ranged elemental infected; normal
 // humanoid shamblers and runners use the human-infected mesh.
 return [2,3,7].includes(Number(z?.ty))?'hazmat':'human';
}
export function selectZombieRoleClips(animations,source) {
 const clips=new Map();
 const list=Array.isArray(animations)?animations:[];
 const names=new Map(list.map(clip=>[clip.name,clip]));
 for(const [role,aliases] of Object.entries(source.roles)){
  const clip=aliases.map(alias=>names.get(alias)).find(Boolean);
  if(clip)clips.set(role,clip);
 }
 if(!clips.has('Idle')||!clips.has('Walk')||!clips.has('Idle_Attack'))return null;
 return clips;
}
export function stripRootXZ(clip) {
 // Mutate only a clone returned by GLTFLoader, not the original baked clip.
 // This avoids drifting forward from the spawn/server position each cycle.
 const result=clip.clone();
 for(const track of result.tracks||[]){
  if(!/\.position$/.test(track.name)||!/(hips|root|armature)/i.test(track.name))continue;
  const firstX=track.values[0],firstZ=track.values[2];
  for(let i=0;i<track.values.length;i+=3){track.values[i]=firstX;track.values[i+2]=firstZ;}
  break;
 }
 return result;
}
