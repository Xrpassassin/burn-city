#!/usr/bin/env node
// Vendoring only pre-credited CC-BY GLB files from an openly served reference
// project. No Sketchfab authentication bypass, scraping the viewer, or use
// of unknown third-party asset mirrors. Every resource must authenticate its
// original author/source in the GLB metadata (or in the source credits).
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../client/arena/assets/zombies/',import.meta.url);
const BASE='https://walking.morgannriu.fr/assets/models/';
const SOURCES=[
 {file:'zombie-aiden.glb',origin:'zombie-aiden.glb',author:'Aiden Studios',source:'https://sketchfab.com/3d-models/zombie-rigged-animated-131688807ad444609ed9b2ed572dc4aa',
  license:'CC-BY-4.0',clips:['Idle','Walk1','Attack1.001'],maxBytes:8_000_000},
 {file:'zombie-hazmat.glb',origin:'zombie-hazmat.glb',author:'LxNazarov',source:'https://sketchfab.com/3d-models/zombie-hazmat-49b3b4307f6a4d2386fdb02354158d04',
  license:'CC-BY-4.0',clips:['Zombie_Idle','Zombie_Walk_Root','Zombie_Skill'],maxBytes:6_000_000},
 {file:'zombie-thin.glb',origin:'zombie-real-2.glb',author:'Rosswet Mobile',source:'https://opengameart.org/content/thin-zombie-awake-zombie-asset',
  license:'CC-BY-3.0',clips:['idle','walk','run','attack1_r','hurt','dead1'],maxBytes:5_000_000}
];
function validateGlb(buffer,item){
 if(buffer.byteLength<32||buffer.toString('ascii',0,4)!=='glTF'||buffer.readUInt32LE(4)!==2||
    buffer.readUInt32LE(8)!==buffer.byteLength||buffer.readUInt32LE(16)!==0x4e4f534a)
  throw Error(item.file+': invalid GLB v2 header/chunk size');
 const size=buffer.readUInt32LE(12);
 if(size<100||size>buffer.byteLength-20)throw Error(item.file+': malformed GLB JSON length');
 const json=JSON.parse(buffer.toString('utf8',20,20+size));
 if(json.asset?.version!=='2.0'||!json.skins?.length||!json.meshes?.length||
    !json.materials?.length||!json.textures?.length)throw Error(item.file+': missing skinned and textured humanoid');
 const animations=new Set((json.animations||[]).map(x=>x.name));
 for(const name of item.clips)if(!animations.has(name))throw Error(item.file+': required clip missing '+name);
 if(item.file!=='zombie-thin.glb'){
  const x=json.asset?.extras||{};
  if(x.source!==item.source||!x.author?.includes(item.author)||!x.license?.includes(item.license))
   throw Error(item.file+': creator/license/source provenance mismatch');
 }
 const triangles=(json.meshes||[]).reduce((acc,m)=>acc+(m.primitives||[]).length,0);
 return {animations:[...animations],skins:json.skins.length,meshes:json.meshes.length,materials:json.materials.length,
  images:json.images?.length||0,primitiveGroups:triangles};
}
await mkdir(root,{recursive:true});
const result=[];
for(const item of SOURCES){
 const dest=new URL(item.file,root);
 let existing=null;
 try{existing=await readFile(dest)}catch(e){if(e.code!=='ENOENT')throw e;}
 const use=existing&&!process.argv.includes('--refresh')?existing:null;
 const res=use?null:await fetch(BASE+item.origin,{headers:{'accept':'model/gltf-binary,application/octet-stream,*/*'},
   signal:AbortSignal.timeout(35_000),redirect:'follow'});
 if(res&&!res.ok)throw Error(item.file+': cannot retrieve public source HTTP '+res.status);
 const bytes=use||Buffer.from(await res.arrayBuffer());
 if(bytes.length>item.maxBytes||bytes.length<30_000)throw Error(item.file+': unexpected asset size '+bytes.length);
 const info=validateGlb(bytes,item);
 if(!use){
  const temp=new URL(item.file+'.tmp',root);
  await writeFile(temp,bytes);
  await rename(temp,dest);
 }
 result.push({asset:item.file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
  license:item.license,creator:item.author,source:item.source,...info});
}
await writeFile(new URL('sketchfab-verified-asset-manifest.json',root),JSON.stringify({sourceHost:BASE,
 note:'Files redistributed under original authors’ CC BY licenses; optimized in the cited reference game; see ATTRIBUTION-SKETCHFAB.md',models:result},null,2)+'\n');
console.log(JSON.stringify({assets:result.map(x=>({name:x.asset,bytes:x.bytes,clips:x.animations.length,sha256:x.sha256}))},null,2));
