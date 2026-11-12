#!/usr/bin/env node
// REVIEW-ONLY acquisition of codersan's original FREE FBX distribution.
// This never enables or commits a third-party character to production.
// The Sketchfab listing declares CC BY 4.0. Authenticate/checkout bypasses,
// Sketchfab viewer ripping, unknown mirrors and paid downloads are forbidden.
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

const origin='https://codersan.itch.io/zombie-apocalypse-survivor-male-3d';
const sketchfab='https://sketchfab.com/3d-models/3d-zombie-apocalypse-survivor-male-character-f56ffc64d18c40cf95d17559542ca44c';
const target=path.resolve('survivor-source-audit');
await mkdir(target,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
 if(!new URL(page.url()).hostname.endsWith('itch.io'))throw Error('Unexpected download source');
 // This creator exposes TWO direct free upload buttons: fbx.rar and a
 // Unity .unitypackage. Select the official FBX row, never the Unity package.
 const row=page.locator('.upload').filter({hasText:/fbx\.rar/i}).first();
 await row.waitFor({timeout:20000});
 if(!await row.locator('.upload_name [title="fbx.rar"]').count())
  throw Error('Official author-provided fbx.rar file row missing');
 const downloadButton=row.locator('a.download_btn').first();
 const [download]=await Promise.all([
  page.waitForEvent('download',{timeout:90000}),
  downloadButton.click({timeout:25000})
 ]);
 if(download.failure) {
  const failure=await download.failure();
  if(failure)throw Error('Creator download failed: '+failure);
 }
 if(download.suggestedFilename()!=='fbx.rar')
  throw Error('The creator changed the source archive filename; review manually');
 const file=path.join(target,'fbx.rar');
 await download.saveAs(file);
 const bytes=await readFile(file);
 if(bytes.length<1_000_000||bytes.length>24_000_000)
  throw Error('Suspicious or unexpectedly sized public archive '+bytes.length);
 const rar4=bytes.subarray(0,7).equals(Buffer.from([0x52,0x61,0x72,0x21,0x1a,0x07,0x00]));
 const rar5=bytes.subarray(0,8).equals(Buffer.from([0x52,0x61,0x72,0x21,0x1a,0x07,0x01,0x00]));
 if(!rar4&&!rar5)throw Error('Creator download is not a genuine RAR archive');
 const manifest={status:'SOURCE_ARCHIVE_ONLY_NOT_ENABLED',
  creator:'codersan',source:origin,sketchfab,license:'CC-BY-4.0',
  file:'fbx.rar',bytes:bytes.length,format:rar5?'RAR5':'RAR4',
  sha256:createHash('sha256').update(bytes).digest('hex'),
  note:'The archived FBX is not an approved playable GLB. Inspect clips, rig, textures and frame costs before activation.'};
 await writeFile(path.join(target,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(manifest,null,2));
}finally{await browser.close();}
