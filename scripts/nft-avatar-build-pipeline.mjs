#!/usr/bin/env node
// Orchestrates deterministic Blender GLB blockout generation and emits an unapproved candidate record.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_GENERATOR = path.join(ROOT, 'tools', 'blender', 'nft_avatar_generator.py');
const safeId = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(String(value || ''));
export function validateBuildInputs(spec, outputPath) {
  const errors=[];
  if (!spec || typeof spec!=='object' || Array.isArray(spec)) return ['build spec must be an object'];
  if (spec.specVersion!==1) errors.push('specVersion must be 1');
  if (!spec.identity || typeof spec.identity!=='object') errors.push('identity is required');
  if (!spec.identity || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(spec.identity.collectionKey||''))) errors.push('identity.collectionKey must be a safe slug');
  if (!spec.identity || !safeId(spec.identity.tokenId)) errors.push('identity.tokenId must be a safe filename component');
  if (!spec.reconstruction || typeof spec.reconstruction!=='object') errors.push('reconstruction is required');
  if (!outputPath || path.extname(outputPath).toLowerCase()!=='.glb') errors.push('output path must end in .glb');
  return errors;
}
export function buildCandidateRecord(spec, outputRelativePath, bytes, sha256, now='') {
  return {
    schemaVersion:1, stage:'procedural-blockout', runtimeApproved:false,
    identity:{collectionKey:spec.identity.collectionKey,tokenId:String(spec.identity.tokenId),displayName:spec.identity.displayName||String(spec.identity.tokenId),artworkReference:spec.identity.artworkReference||null},
    output:{path:outputRelativePath,format:'glb',units:'meters',bytes,sha256},
    provenance:{generator:'BURN City Blender procedural blockout',generatorVersion:'0.1.0',specVersion:spec.specVersion,generatedAt:now||null},
    review:{rights:'pending-review',visualQa:'not-reviewed',mobilePerformance:'not-profiled',rigging:'unrigged-blockout'},
    warnings:['Procedural blockout only; not a faithful reconstruction of the source NFT.','Not runtime approved.','Replace or augment blockout geometry with reviewed collection-specific authored assets.']
  };
}
export async function buildBlockout({specPath,outputPath,blender=process.env.BLENDER_BIN||'blender',generatorPath=DEFAULT_GENERATOR,manifestPath=null}) {
  const absoluteSpec=path.resolve(specPath), absoluteOutput=path.resolve(outputPath);
  const spec=JSON.parse(await fs.readFile(absoluteSpec,'utf8'));
  const errors=validateBuildInputs(spec,absoluteOutput);
  if(errors.length) throw new Error(errors.join('; '));
  await fs.mkdir(path.dirname(absoluteOutput),{recursive:true});
  try { await fs.access(absoluteOutput); throw new Error('refusing to overwrite existing output: '+absoluteOutput); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  const run=spawnSync(blender,['--background','--python',generatorPath,'--',absoluteSpec,absoluteOutput],{encoding:'utf8',maxBuffer:8*1024*1024});
  if(run.error) throw new Error('could not start Blender ('+blender+'): '+run.error.message);
  if(run.status!==0) throw new Error('Blender blockout generation failed (exit '+run.status+')\n'+String(run.stderr||'').slice(-4000));
  const data=await fs.readFile(absoluteOutput);
  if(data.length<100 || data.subarray(0,4).toString('ascii')!=='glTF') throw new Error('generator output is not a valid GLB container');
  const sha256=createHash('sha256').update(data).digest('hex');
  const relative=path.relative(ROOT,absoluteOutput).split(path.sep).join('/');
  const record=buildCandidateRecord(spec,relative,data.length,sha256,new Date().toISOString());
  if(manifestPath) {
    const target=path.resolve(manifestPath);
    try { await fs.access(target); throw new Error('refusing to overwrite existing candidate record: '+target); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
    await fs.mkdir(path.dirname(target),{recursive:true});
    await fs.writeFile(target,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  }
  return {record,stdout:run.stdout};
}
async function main(){
 const [specPath,outputPath,manifestPath]=process.argv.slice(2);
 if(!specPath||!outputPath){console.error('Usage: node scripts/nft-avatar-build-pipeline.mjs build-spec.json output.glb [candidate-record.json]');process.exitCode=2;return;}
 try { const result=await buildBlockout({specPath,outputPath,manifestPath}); console.log(result.stdout.trim()); console.log(JSON.stringify(result.record,null,2)); }
 catch(error){console.error('BLOCKOUT BUILD FAILED: '+error.message);process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
