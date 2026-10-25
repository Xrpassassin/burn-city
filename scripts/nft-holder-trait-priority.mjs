#!/usr/bin/env node
// Token-only, offline prioritization of collection-specific 3D traits for connected holders.
// Reads a verified holder avatar queue; never outputs wallet addresses or private session data.
import fs from 'node:fs';

const SUPPORTED = new Set(['racc','fk','589']);
const safeText = v => String(v ?? '').trim().slice(0,160);
export function buildHolderTraitPriority(holderQueue) {
  if (!holderQueue || !Array.isArray(holderQueue.queue)) throw new TypeError('Verified holder avatar queue is required');
  const byCollection = new Map();
  const seen = new Set();
  for (const item of holderQueue.queue) {
    const collection = safeText(item?.collection).toLowerCase();
    const tokenId = safeText(item?.tokenId).toUpperCase();
    if (!SUPPORTED.has(collection) || !/^[0-9A-F]{64}$/.test(tokenId) || !item?.spec?.identity ||
        item.spec.identity.collectionKey !== collection) continue;
    const unique = collection+':'+tokenId;
    if(seen.has(unique)) continue;
    seen.add(unique);
    if(!byCollection.has(collection)) byCollection.set(collection,{tokens:0,traits:new Map(),unmapped:new Map()});
    const group=byCollection.get(collection);
    group.tokens++;
    const traits=item.spec.normalizedTraits;
    if(!Array.isArray(traits)) continue;
    const perToken=new Set();
    for(const trait of traits) {
      const type=safeText(trait?.sourceType),value=safeText(trait?.sourceValue);
      if(!type || !value) continue;
      const slot=safeText(trait.renderSlot)||'unknown';
      const key=JSON.stringify([type,value,slot]);
      if(perToken.has(key))continue;
      perToken.add(key);
      const target=trait.mapped===false ? group.unmapped : group.traits;
      if(!target.has(key))target.set(key,{sourceType:type,sourceValue:value,renderSlot:slot,holderTokenCount:0,productionStatus:'needs_3d_asset'});
      target.get(key).holderTokenCount++;
    }
  }
  const collections=[...byCollection].sort(([a],[b])=>a.localeCompare(b)).map(([key,group])=>{
    const order=map=>[...map.values()].sort((a,b)=>b.holderTokenCount-a.holderTokenCount||a.sourceType.localeCompare(b.sourceType)||a.sourceValue.localeCompare(b.sourceValue));
    return {collection:key,connectedHolderTokenCount:group.tokens,baseModelStatus:'needs_visual_approval',
      priorityTraits:order(group.traits),unmappedTraits:order(group.unmapped)};
  });
  return {schemaVersion:1,source:'verified-holder-avatar-queue',tokenCount:seen.size,collections,
    note:'Counts represent unique verified tokens in the supplied snapshot, not unique wallets or live ownership. No assets are approved by this report.'};
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  const input=process.argv[2];
  if(!input){console.error('Usage: node scripts/nft-holder-trait-priority.mjs verified-avatar-queue.json > trait-priority.json');process.exitCode=2;}
  else {try{process.stdout.write(JSON.stringify(buildHolderTraitPriority(JSON.parse(fs.readFileSync(input,'utf8'))),null,2)+'\n');}
  catch(e){console.error('Trait priority failed:',e.message);process.exitCode=1;}}
}
