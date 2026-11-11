// Visual casting for the ORIGINAL Arena Zombies game. Maps existing enemy
// types onto individually credited, rigged infected-human art, without
// changing movement, hitboxes, map spawning, AI, damage, waves or rewards.
export const ZOMBIE_SKETCHFAB_MODELS=Object.freeze([
 Object.freeze({id:'human',file:'zombie-aiden.glb',creator:'Aiden Studios',license:'CC-BY-4.0',
  aliases:Object.freeze({Idle:'Idle',Walk:'Walk1',Run:'Walk1',Idle_Attack:'Attack1.001'})}),
 Object.freeze({id:'hazmat',file:'zombie-hazmat.glb',creator:'LxNazarov',license:'CC-BY-4.0',
  aliases:Object.freeze({Idle:'Zombie_Idle',Walk:'Zombie_Walk_Root',Run:'Zombie_Walk_Root',Idle_Attack:'Zombie_Skill'})}),
 Object.freeze({id:'thin',file:'zombie-thin.glb',creator:'Rosswet Mobile',license:'CC-BY-3.0',
  aliases:Object.freeze({Idle:'idle',Walk:'walk',Run:'run',Crawl:'walk',Idle_Attack:'attack1_r',HitReact:'hurt',Death:'dead1'})})
]);
// Type IDs are the nine existing ORIGINAL Zombies archetypes. A stage boss
// retains its original mechanical identity; a special suit is only cosmetic.
const CAST=Object.freeze(['human','thin','human','hazmat','thin','thin','hazmat','hazmat','human']);
export function zombieVisualModelId(type){
 const i=Number.isInteger(type)&&type>=0&&type<CAST.length?type:0;
 return CAST[i];
}
export function zombieClipAliases(model,animations){
 const present=new Set(animations||[]);
 return new Map(Object.entries(model.aliases).filter(([,name])=>present.has(name)));
}
