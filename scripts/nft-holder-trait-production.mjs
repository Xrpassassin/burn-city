#!/usr/bin/env node
// Offline production plan from verified connected-holder trait frequencies.
// Generates a prioritized authoring backlog, never asserts a model exists.
import fs from 'node:fs';
import {createNftAvatarAttachmentRig} from '../client/js/nft-avatar-attachment-rig.mjs';
import {createNftTraitLibrary} from '../client/js/nft-avatar-trait-library.mjs';

export function planHolderTraitProduction(priority, entries=[]) {
 if(!priority || priority.source!=='verified-holder-avatar-queue'||!Array.isArray(priority.collections))throw new TypeError('Expected verified holder trait priority report');
 const library=createNftTraitLibrary(entries);
 const collections=[];
 for(const group of priority.collections) {
  const rig=createNftAvatarAttachmentRig(group.collection);
  if(rig.collectionKey!==group.collection || !Array.isArray(group.priorityTraits)||!Array.isArray(group.unmappedTraits))throw new TypeError('Unsupported collection or invalid traits');
  const jobs=[...group.priorityTraits,...group.unmappedTraits].map(trait=>{
   const sourceType=String(trait.sourceType||''),sourceValue=String(trait.sourceValue||''),slot=String(trait.renderSlot||'unknown');
   const anchor=rig.slotAnchors[slot]||null;
   const existing=library.resolve(group.collection,sourceType,sourceValue);
   const ready=Boolean(anchor && existing?.approved===true && existing.anchor===anchor);
   return {sourceType,sourceValue,renderSlot:slot,anchor,holderTokenCount:trait.holderTokenCount,
    status:ready?'approved-asset':!anchor?'needs-trait-mapping':existing?'needs-asset-review':'needs-3d-authoring',
    candidateUri:existing?.uri||null,requiredReviews:['original-artwork-fidelity','asset-rights','rig-fit','mobile-performance']};
  }).sort((a,b)=>b.holderTokenCount-a.holderTokenCount||a.sourceType.localeCompare(b.sourceType)||a.sourceValue.localeCompare(b.sourceValue));
  collections.push({collection:group.collection,baseModel:{rigProfile:rig.rigProfile,anchors:rig.anchors,status:'needs-authored-mesh-and-rig'},
   connectedHolderTokenCount:group.connectedHolderTokenCount,traitJobs:jobs});
 }
 return {schemaVersion:1,source:'verified-holder-avatar-queue',collections,
  note:'Offline authoring backlog only. Never auto-approve generated geometry or grant wallet ownership.'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const [reportFile,libraryFile]=process.argv.slice(2);
 if(!reportFile){console.error('Usage: node scripts/nft-holder-trait-production.mjs trait-priority.json [trait-library.json]');process.exitCode=2;}
 else try{
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  const entries=libraryFile?JSON.parse(fs.readFileSync(libraryFile,'utf8')):[];
  process.stdout.write(JSON.stringify(planHolderTraitProduction(report,entries),null,2)+'\n');
 }catch(e){console.error('Trait production planning failed:',e.message);process.exitCode=1;}
}
