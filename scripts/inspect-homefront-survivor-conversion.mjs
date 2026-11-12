#!/usr/bin/env node
// Read the source-audited local Blender GLB; emit its actual rig/clip/material
// findings. NEVER mark the model installed or update the production manifest.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve('survivor-source-audit');
const name='homefront-male-survivor.glb';
const bytes=await readFile(path.join(root,name));
if(bytes.length<100_000||bytes.length>70_000_000)throw Error('Converted GLB size is abnormal');
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||
 bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)
 throw Error('Bad glTF 2.0 binary container');
const jsonLength=bytes.readUInt32LE(12);
if(jsonLength<100||jsonLength>bytes.length-20)throw Error('Invalid JSON glTF chunk');
const doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
const meshes=doc.meshes||[];
const triangles=meshes.reduce((sum,mesh)=>sum+(mesh.primitives||[]).reduce((n,prim)=>{
 const accessor=doc.accessors?.[prim.indices??prim.attributes?.POSITION];
 return n+(accessor?.count||0)/3;
},0),0);
if(triangles<1000||triangles>60000||!doc.skins?.length||!doc.nodes?.length)
 throw Error('Converted hero mesh not in safe skinned mobile geometry range');
if((doc.images||[]).some(image=>image.uri&& !image.uri.startsWith('data:')))
 throw Error('GLB must embed all image dependencies; no external network fetches');
const clips=(doc.animations||[]).map(clip=>clip.name||'Unnamed');
const locomotion=clips.some(name=>/walk|run/i.test(name));
const textures=doc.images?.length||0;
const idles=(doc.animations||[]).filter(clip=>/^Idle(?:2|3)?$/i.test(clip.name||''));
if(textures<1||idles.length!==3)throw Error('Artist texture and all three real idle animation clips are required');
for(const clip of idles){
 const sampled=clip.samplers?.some(sampler=>{
  const a=doc.accessors?.[sampler.input];
  return a?.count>=10 && (a.max?.[0]??0)-(a.min?.[0]??0)>=0.5;
 });
 if(!sampled)throw Error('Author idle clip is not actually animated: '+clip.name);
}
const audit={
 status:locomotion?'READY_FOR_BROWSER_RIG_REVIEW':'REVIEW_REQUIRED_WALK_RUN',
 name,sha256:createHash('sha256').update(bytes).digest('hex'),
 bytes:bytes.length,vertices:(doc.accessors||[]).filter(a=>a.type==='VEC3').reduce((m,a)=>Math.max(m,a.count||0),0),
 triangles:Math.round(triangles),meshes:meshes.length,skins:doc.skins.length,
 materials:doc.materials?.length||0,images:textures,animations:clips,
 hasLocomotionClip:locomotion,authorIdleClips:idles.map(x=>x.name),
 note:'Provisional source conversion only; no production import. Inspect bind pose, animation playback and actual visible PBR textures in Three.js before setting installed:true.'
};
await writeFile(path.join(root,'glb-audit.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit,null,2));
