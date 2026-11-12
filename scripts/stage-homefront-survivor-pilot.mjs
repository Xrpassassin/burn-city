#!/usr/bin/env node
// Strictly verify ORIGINAL CC BY male-survivor GLB + locally authored gait.
// This is called only on the controlled review branch after an official
// creator archive has been converted in the read-only source audit (#616).
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const working='survivor-source-audit';
const file=join(working,'homefront-male-survivor.glb');
const bin=readFileSync(file);
const sha256=createHash('sha256').update(bin).digest('hex');
if(bin.length<1_000_000||bin.length>8_000_000||
  bin.toString('ascii',0,4)!=='glTF'||bin.readUInt32LE(4)!==2||
  bin.readUInt32LE(8)!==bin.length||bin.readUInt32LE(16)!==0x4e4f534a)
 throw Error('Not the reviewed mobile-budget glTF 2.0 archive');
const chunkLength=bin.readUInt32LE(12);
const doc=JSON.parse(bin.toString('utf8',20,20+chunkLength));
const source=JSON.parse(readFileSync(join(working,'source-manifest.json'),'utf8'));
const motion=JSON.parse(readFileSync(join(working,'original-motion-audit.json'),'utf8'));
if(source.sha256!=='f8c7d876b2386a5ad08d2fb1ca168906e3c342a31f6724f36ccb140d0d3e299a'||
   source.license!=='CC-BY-4.0'||motion.sourceGLBSha256!=='d8aed7c8fccd3940f54867437afa99927784724dc232885d3dec130918d64b69'||
   motion.unityStarterAssetsClipsUsed!==false||sha256!==motion.sha256)
 throw Error('Author source provenance or original motion audit does not match');
if((doc.skins||[]).length!==1||(doc.meshes||[]).length!==1||(doc.images||[]).length!==1)
 throw Error('Unexpected source hero skeleton/mesh/albedo configuration');
if((doc.images||[]).some(x=>/^https?:|^\/\//i.test(x.uri||'')))
 throw Error('External texture hotlink found in GLB');
const triangleCount=doc.meshes.reduce((total,mesh)=>total+(mesh.primitives||[]).reduce((n,part)=>{
 const a=doc.accessors?.[part.indices??part.attributes?.POSITION];return n+(a?.count||0)/3;
},0),0);
if(Math.round(triangleCount)!==10000)throw Error('Hero model triangle budget not as source-approved');
const wanted=['Idle','Idle2','Idle3','Walk','Run','Jump'];
const animations=doc.animations||[];
const byName=new Map(animations.map(a=>[a.name,a]));
if(wanted.some(name=>!byName.has(name)))throw Error('Missing real original idle or authored locomotion clip');
for(const kind of ['Walk','Run','Jump']){
 const clip=byName.get(kind);
 if(clip.channels.length<10||clip.samplers.length!==clip.channels.length)
  throw Error(kind+' lacks full-joint animation');
 const times=clip.samplers.map(s=>doc.accessors[s.input]);
 const quats=clip.samplers.map(s=>doc.accessors[s.output]);
 if(times.some(a=>a.type!=='SCALAR'||a.count<20||!a.max?.[0])||
    quats.some(a=>a.type!=='VEC4'||a.componentType!==5126||a.count<20))
  throw Error(kind+' animation sample encoding invalid');
}
const approved={asset:'homefront-male-survivor.glb',sourceUrl:source.source,
 creator:'codersan',license:source.license,sourceArchiveSha256:source.sha256,
 sha256,bytes:bin.length,triangles:10000,skins:1,materials:doc.materials?.length||0,
 textures:doc.images.length,animations:wanted,
 motionSource:'Original, deterministic local Blender-compatible quaternion gait; not Unity/StarterAssets animation',
 licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
 note:'Rigged male-survivor pilot, retained fallback. Visual acceptance required before production merge.'};
const dest='client/arena/assets/community';
mkdirSync(dest,{recursive:true});
copyFileSync(file,join(dest,'homefront-male-survivor.glb'));
writeFileSync(join(dest,'homefront-survivor-verified.json'),JSON.stringify(approved,null,2)+'\n');
const catalog='client/arena/community-art-intake.mjs';
let src=readFileSync(catalog,'utf8');
const old="'codersan',10000,{purpose:'temporary_player',rigged:true,animationRequired:true})";
if(!src.includes(old))throw Error('Unrecognized source catalog; refuse automatic activation');
src=src.replace(old,"'codersan',10000,{purpose:'temporary_player',rigged:true,animationRequired:true,installed:true,sha256:'"+sha256+"'})");
writeFileSync(catalog,src);
console.log(JSON.stringify(approved,null,2));
