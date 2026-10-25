import assert from 'node:assert/strict';
import {CINDER_COVE_NPCS,CINDER_COVE_QUESTS,questPreview,npcDialogue} from './cinder-cove-quests.mjs';
assert.equal(Object.keys(CINDER_COVE_NPCS).length,4);
assert.equal(Object.keys(CINDER_COVE_QUESTS).length,4);
for(const [id,npc] of Object.entries(CINDER_COVE_NPCS)){
 assert.ok(CINDER_COVE_QUESTS[npc.quest]);
 assert.equal(npcDialogue(id).quest.id,npc.quest);
 const q=CINDER_COVE_QUESTS[npc.quest];
 assert.equal(questPreview(npc.quest,q.steps).complete,true);
 assert.equal(questPreview(npc.quest).nextStep,q.steps[0]);
}
assert.equal(questPreview('__proto__'),null);
assert.equal(npcDialogue('constructor'),null);
console.log('Cinder Cove NPC and mission tests passed');
