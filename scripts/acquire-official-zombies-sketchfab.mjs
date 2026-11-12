#!/usr/bin/env node
// REVIEW ONLY: creator-licensed Sketchfab Download API; never a viewer rip.
// Must be run with a user-owned SKETCHFAB_OAUTH_TOKEN stored as a GitHub
// Actions secret. Do not put Bearer tokens or expiring signed URLs in logs,
// issues, artifacts, user interfaces, game clients or repository source.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const MODELS=Object.freeze({
 nurse:{uid:'2bc6e1cac98e458a824691009ef2433c',artist:'Krimzonhaze',
  name:'Horror Mutant Bloody Nurse Gore (RIGGED)',maxFaces:50000},
 blob:{uid:'6357bbc094d54cf5ba150ef2951b3750',artist:'Tim0',
  name:'Living Flesh Blob - Free Organic Horror Asset',maxFaces:20000}
});
const selected=process.argv[2];
if(!Object.hasOwn(MODELS,selected))
 throw Error('Select nurse or blob from explicitly approved creator IDs');
const token=process.env.SKETCHFAB_OAUTH_TOKEN||'';
if(token.length<12)throw Error('SKETCHFAB_OAUTH_TOKEN not connected. Official Sketchfab sign-in and a repository secret are required.');
const model=MODELS[selected],output=join('zombie-special-audit',selected);
await mkdir(output,{recursive:true});
const base='https://api.sketchfab.com/v3/models/'+model.uid;
async function publicJson(url,headers={}){
 const response=await fetch(url,{headers:{Accept:'application/json',...headers},
  cache:'no-store'});
 if(!response.ok)throw Error('Official Sketchfab API returned status '+response.status);
 return response.json();
}
const metadata=await publicJson(base);
if(metadata.uid!==model.uid||metadata.license?.slug!=='by'||
 metadata.isDownloadable!==true||
 String(metadata.user?.username||'').toLowerCase()!==model.artist.toLowerCase()||
 !Number.isFinite(metadata.faceCount)||metadata.faceCount>model.maxFaces)
 throw Error('Author, license, download setting, or geometry differs from approved Sketchfab listing');
const reply=await publicJson(base+'/download',{Authorization:'Bearer '+token});
const candidate=reply?.gltf;
if(!candidate||!Number.isFinite(candidate.size)||candidate.size<10_000||
 candidate.size>110_000_000||!candidate.url)
 throw Error('Authenticated model does not supply a bounded official glTF archive');
const url=new URL(candidate.url);
if(url.protocol!=='https:'||url.username||url.password)
 throw Error('Sketchfab returned unexpected signed download protocol');
const download=await fetch(url,{headers:{'Accept':'application/zip'},cache:'no-store'});
if(!download.ok)throw Error('Signed Sketchfab download returned HTTP '+download.status);
const limit=115_000_000;
const bytes=Buffer.from(await download.arrayBuffer());
if(bytes.length<10_000||bytes.length>limit||
 bytes[0]!==0x50||bytes[1]!==0x4b)
 throw Error('Download is not a bounded ZIP from official Sketchfab Download API');
const archive=join(output,'official-gltf.zip');
await writeFile(archive,bytes);
const manifest={status:'REVIEW_ONLY_NOT_INSTALLED',model:selected,
 uid:model.uid,title:metadata.name,creator:metadata.user.username,
 license:'CC-BY-4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/',
 source:'https://sketchfab.com/models/'+model.uid,
 creatorSaysDownloadable:true,
 publishedAnimationCount:metadata.animationCount,
 note:selected==='nurse'
  ?'Nurse has NO published animation clips. Must generate/retarget actual locomotion and attack for the original Warden rig before activation.'
  :'Blob has one advertised pulsing animation; inspect real animation, UV/PBR and skinned mesh before activating original crawler identity.',
 downloadedFilename:'official-gltf.zip',bytes:bytes.length,
 sha256:createHash('sha256').update(bytes).digest('hex'),
 gameEnabled:false};
await writeFile(join(output,'source-manifest.json'),
 JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2)); // no tokens or signed links
