'use strict';
// QA-only launcher. No browser package is installed by this script.
// Usage: node scripts/browser-qa-command.cjs http://127.0.0.1:8080
const {URL}=require('node:url');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const target=process.argv[2]||'http://127.0.0.1:8080';
let u;
try{u=new URL(target);}catch{console.error('Invalid QA URL');process.exit(2);}
if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash){
 console.error('QA runner only accepts local loopback URLs without credentials, query or fragment');process.exit(2);
}
if(process.env.CI==='true'&&!process.env.BURN_QA_ALLOW_CI){console.error('Browser QA requires explicit CI opt-in');process.exit(2);}
const allowed=u.hostname.replace(/^\[|\]$/g,'');
if(u.pathname!=='/'&&(!u.pathname.startsWith('/')||u.pathname.includes('..'))){console.error('Invalid QA path');process.exit(2);}
const base=[]; // Restrict through environment and OS isolation; verify CLI flags against pinned release.
const env={};
// Do not inherit wallet, deployment, cloud, or AI provider credentials from the shell.
for(const k of ['PATH','HOME','TMPDIR','TEMP','TMP','SYSTEMROOT','WINDIR','USERPROFILE','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];
Object.assign(env,{AGENT_BROWSER_ALLOWED_DOMAINS:allowed,AGENT_BROWSER_CONTENT_BOUNDARIES:'1',AGENT_BROWSER_MAX_OUTPUT:'12000',AGENT_BROWSER_CONFIRM_ACTIONS:'eval,download,upload',AGENT_BROWSER_CONFIRM_INTERACTIVE:'1',AGENT_BROWSER_RESTORE_SAVE:'never'});
const browserBin=process.env.BURN_QA_BROWSER_BIN;
if(!browserBin||!path.isAbsolute(browserBin)||!fs.existsSync(browserBin)||!fs.statSync(browserBin).isFile()){
 console.error('Set BURN_QA_BROWSER_BIN to the audited absolute path of the QA browser executable');process.exit(2);
}
const commands=[
 ['open',u.origin + u.pathname + '?qa=1'],
 ['set','viewport','390','844'],
 ['screenshot','burn-city-mobile.png'],
 ['snapshot'],
 ['set','viewport','1440','900'],
 ['screenshot','burn-city-desktop.png'],
 ['errors'],
 ['close']
];
for(const args of commands){
 const r=spawnSync(browserBin,[...base,...args],{env,stdio:'inherit',timeout:60000,shell:false});
 if(r.error||r.status!==0){console.error('QA command failed:',args[0],r.error?.message||r.status);process.exit(1);}
}
console.log('Browser smoke run completed. Review screenshots and logs manually; this is not a gameplay pass.');
