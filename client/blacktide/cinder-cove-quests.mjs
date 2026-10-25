// Cinder Cove's first NPC and mission content. No client-side reward authorization.
export const CINDER_COVE_NPCS=Object.freeze({
 'mara-vale':{name:'Mara Vale',role:'Harbormaster',faction:'gilded-exchange',location:'docks',quest:'first-landfall'},
 'silas-reed':{name:'Silas Reed',role:'Tavern Keeper',faction:'ashen-veil',location:'tavern',quest:'whispers-in-the-cove'},
 'elara-flint':{name:'Elara Flint',role:'Crew Recruiter',faction:'freewater',location:'market',quest:'a-crew-of-your-own'},
 'captain-voss':{name:'Captain Voss',role:'Crown Officer',faction:'iron-crown',location:'guard-post',quest:'the-crown-watches'}
});
export const CINDER_COVE_QUESTS=Object.freeze({
 'first-landfall':{title:'First Landfall',npc:'mara-vale',steps:['disembark','speak-harbormaster','visit-tavern'],rewardPreview:{gold:25,xp:15}},
 'whispers-in-the-cove':{title:'Whispers in the Cove',npc:'silas-reed',steps:['speak-tavern-keeper','inspect-noticeboard','return-tavern'],rewardPreview:{gold:35,xp:20}},
 'a-crew-of-your-own':{title:'A Crew of Your Own',npc:'elara-flint',steps:['meet-recruiter','review-candidates','choose-recruit'],rewardPreview:{gold:0,xp:25}},
 'the-crown-watches':{title:'The Crown Watches',npc:'captain-voss',steps:['approach-guard-post','hear-warning'],rewardPreview:{gold:0,xp:10}}
});
export function questPreview(id,completedSteps=[]) {
 if(!Object.hasOwn(CINDER_COVE_QUESTS,id))return null;
 const quest=CINDER_COVE_QUESTS[id];
 const done=new Set(Array.isArray(completedSteps)?completedSteps:[]);
 const next=quest.steps.find(step=>!done.has(step))??null;
 return {id,title:quest.title,npc:quest.npc,nextStep:next,complete:next===null,
   rewardPreview:{...quest.rewardPreview}};
}
export function npcDialogue(npcId,questSteps=[]) {
 if(!Object.hasOwn(CINDER_COVE_NPCS,npcId))return null;
 const npc=CINDER_COVE_NPCS[npcId];
 const quest=questPreview(npc.quest,questSteps);
 return {npcId,name:npc.name,role:npc.role,faction:npc.faction,quest};
}
