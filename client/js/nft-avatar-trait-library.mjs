// Explicitly reviewed, reusable trait assets keyed by collection + original trait type/value.
// No guessed meshes, fallback lookalikes, wallet data, or implicit approval.
import {planNftTraitAttachments} from './nft-avatar-attachment-rig.mjs';

const token = value => String(value ?? '').trim().normalize('NFKC').toLowerCase();
const keyFor=(collection,type,value)=>JSON.stringify([token(collection),token(type),token(value)]);
const isLocalGlb=uri=>typeof uri==='string' && /^assets\/nft-avatars\/traits\/[a-z0-9/_-]+\.glb$/i.test(uri) && !uri.includes('..');

export function createNftTraitLibrary(entries=[]) {
 if(!Array.isArray(entries))throw new TypeError('Trait entries must be an array');
 const index=new Map();
 for(const entry of entries) {
  if(!entry || typeof entry!=='object')throw new TypeError('Invalid trait asset');
  const collection=token(entry.collection),type=token(entry.sourceType),value=token(entry.sourceValue);
  if(!collection||!type||!value)throw new Error('Trait asset needs collection, sourceType and sourceValue');
  const key=keyFor(collection,type,value);
  if(index.has(key))throw new Error('Duplicate trait asset: '+key);
  if(entry.approved===true && (!isLocalGlb(entry.uri)||entry.rightsApproved!==true||entry.visualReviewed!==true||entry.rigValidated!==true||entry.performanceProfiled!==true)) {
   throw new Error('Approved trait needs local GLB and all review gates: '+key);
  }
  index.set(key,Object.freeze({...entry,collection,sourceType:type,sourceValue:value}));
 }
 return Object.freeze({
  size:index.size,
  resolve(collection,type,value){return index.get(keyFor(collection,type,value))??null;}
 });
}

export function assembleNftTraitLoadout(spec,library) {
 if(!library||typeof library.resolve!=='function')throw new TypeError('Trait library required');
 const plan=planNftTraitAttachments(spec);
 const parts=plan.attachments.map(part=>{
  const asset=library.resolve(plan.collectionKey,part.sourceType,part.sourceValue);
  const ready=Boolean(part.anchor && asset?.approved===true && asset.anchor===part.anchor);
  return Object.freeze({...part,assetUri:ready?asset.uri:null,
   status:ready?'ready-to-load':!part.anchor?'needs-slot-mapping':!asset?'needs-trait-model':asset.approved!==true?'needs-asset-review':'anchor-mismatch'});
 });
 return Object.freeze({collectionKey:plan.collectionKey,parts:Object.freeze(parts),
  readyCount:parts.filter(p=>p.status==='ready-to-load').length,
  incompleteCount:parts.filter(p=>p.status!=='ready-to-load').length,
  runtimeApproved:false});
}
