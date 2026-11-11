#!/usr/bin/env node
// Official public FREE itch.io download ONLY. No paid checkout, scraping
// Sketchfab's 3D viewer, bypasses, account credentials, or arbitrary mirroring.
// Feature branch CI uses this to *stage* the creator's CC-BY 4.0 street GLB.
// Asset remains DISABLED until model-specific QA passes and a human reviews.
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const PAGE='https://crazydrpants.itch.io/street-props-pack';
const DEST=new URL('../client/arena/assets/community/homefront-street-props.glb',import.meta.url);
const MANIFEST=new URL('../client/arena/assets/community/street-props-acquisition.json',import.meta.url);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let page;
try{
 const context=await browser.newContext({acceptDownloads:true});
 page=await context.newPage();
 await page.goto(PAGE,{waitUntil:'domcontentloaded',timeout:45000});
 await page.getByRole('link',{name:/download now/i}).first().click({timeout:25000});
 // The creator's free download page explicitly offers 'No thanks'.
 // Never submit payment, an email, a credit card or sign-in.
 const noThanks=page.getByText(/no thanks, just take me to the downloads/i);
 await noThanks.waitFor({timeout:30000});
 const popups=[];
 page.on('popup',p=>popups.push(p));
 await noThanks.click({timeout:25000});
 await page.waitForTimeout(1300);
 if(popups.length)page=popups.at(-1);
 console.log('[itch] after clicking the free-download choice',{
   hostname:new URL(page.url()).hostname,downloadPage:new URL(page.url()).pathname.includes('/download/'),
   uploadRows:await page.locator('.upload').count(),
   buttons:await page.locator('a.download_btn').count()
 });
 // Never mistake an included-files list on a purchase screen for actual
 // authorized download buttons.
 const fileText=page.getByText(/Street Props Pack\.glb/i).first();
 await fileText.waitFor({timeout:45000});
 let slot=page.locator('.upload').filter({hasText:/Street Props Pack\.glb/}).first();
 if(!await slot.count())slot=page.locator('.upload_display').filter({hasText:/Street Props Pack\.glb/}).first();
 if(!await slot.count()){
   const parentDetails=await fileText.evaluate(node=>{
     let el=node;const levels=[];
     for(let i=0;i<4&&el;i++,el=el.parentElement)levels.push({
       tag:el.tagName,classes:el.className,
       labels:[...el.querySelectorAll('a,button')].map(a=>({
         tag:a.tagName,text:(a.textContent||'').slice(0,60),cls:a.className
       })).slice(0,8)
     });
     return levels;
   });
   console.log('[itch] sanitized file row (no links)',JSON.stringify(parentDetails));
 }
 let link=slot.locator('a.download_btn').first();
 if(!await link.count())link=slot.getByRole('link',{name:/download/i}).first();
 if(!await link.count())link=page.locator('a.download_btn').filter({hasText:/download/i}).first();
 if(!await link.count())throw Error('Artist-hosted file download link not found; do not substitute mirrors.');
 const [download]=await Promise.all([
  page.waitForEvent('download',{timeout:55000}),
  link.click({timeout:30000})
 ]);
 const name=download.suggestedFilename();
 if(!/\.glb$/i.test(name))throw Error('Unexpected author-hosted download filename: '+name);
 await mkdir(new URL('.',DEST),{recursive:true});
 await download.saveAs(DEST.pathname);
 const bytes=await readFile(DEST);
 if(bytes.length<3_000_000||bytes.length>20_000_000)
  throw Error('Unexpected street pack download size: '+bytes.length);
 if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||
  bytes.readUInt32LE(8)!==bytes.length||bytes.readUInt32LE(16)!==0x4e4f534a)
  throw Error('Downloaded file was not a correct binary glTF 2.0 archive');
 const jsonLen=bytes.readUInt32LE(12);
 if(jsonLen<=0||jsonLen>bytes.length-20)throw Error('Invalid glTF JSON chunk');
 const json=JSON.parse(bytes.toString('utf8',20,20+jsonLen));
 if(!json.meshes?.length||!json.nodes?.length||!json.materials?.length)
  throw Error('Not the expected 3D city props package');
 const triangles=(json.meshes||[]).reduce((sum,mesh)=>sum+(mesh.primitives||[]).reduce((n,prim)=>{
  const a=json.accessors?.[prim.indices]||json.accessors?.[Object.values(prim.attributes||{})[0]];
  return n+(a?.count||0)/3;
 },0),0);
 if(triangles<4500||triangles>60000)
  throw Error('Unexpected poly budget for 37-item street prop pack: '+triangles);
 if((json.images||[]).some(img=>/^https?:\/\//.test(img.uri||'')))
  throw Error('Reject remote image dependencies in vendored community GLB');
 const audit={
  asset:'homefront-street-props.glb',creator:'MadeByYeshe / CrazyDrPants',
  originSketchfab:'https://sketchfab.com/3d-models/pbr-street-props-pack-game-ready-8013d8e6af4645d1a7c3d5b24054bfc8',
  distribution:PAGE,license:'CC-BY-4.0',
  sha256:createHash('sha256').update(bytes).digest('hex'),
  bytes:bytes.length,meshes:json.meshes.length,nodes:json.nodes.length,
  triangles:Math.round(triangles),materials:json.materials.length,
  names:json.nodes.map(n=>n.name).filter(Boolean).slice(0,160),
  status:'ACQUIRED_NOT_ENABLED',
  note:'Official free author download; models not activated until per-object scene QA'
 };
 await writeFile(MANIFEST,JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify({ok:true,asset:audit.asset,sha256:audit.sha256,
  bytes:audit.bytes,triangles:audit.triangles,nodeNames:audit.names.slice(0,45)},null,2));
}finally{await browser.close();}
