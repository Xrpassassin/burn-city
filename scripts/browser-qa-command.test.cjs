'use strict';
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const runner=path.join(__dirname,'browser-qa-command.cjs');
function denied(url,extraEnv={}){
 const env={PATH:process.env.PATH||'',CI:'true',...extraEnv};
 const r=spawnSync(process.execPath,[runner,url],{encoding:'utf8',env,timeout:5000});
 assert.equal(r.status,2,`Expected rejection of ${url}; got ${r.status}: ${r.stderr}`);
}
for(const url of [
 'https://example.com','http://127.0.0.2:8080',
 'http://localhost.evil.example:8080',
 'http://user:pass@localhost:8080',
 'file:///etc/passwd','http://localhost:8080/?token=secret',
 'http://localhost:8080/#secret','not-a-url'
])denied(url);
const ci=spawnSync(process.execPath,[runner,'http://127.0.0.1:8080'],{
 encoding:'utf8',env:{PATH:process.env.PATH||'',CI:'true'},timeout:5000
});
assert.equal(ci.status,2);
assert.match(ci.stderr,/explicit CI opt-in/);
console.log('Browser QA launcher rejection tests passed');

const fs=require('node:fs');
const os=require('node:os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'burn-qa-fixture-'));
try{
 const log=path.join(tmp,'invocations.jsonl');
 const mock=path.join(tmp,'fake-browser');
 fs.writeFileSync(mock,`#!/usr/bin/env node
const fs=require('node:fs');
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args:process.argv.slice(2),secret:process.env.BURN_QA_SECRET,allow:process.env.AGENT_BROWSER_ALLOWED_DOMAINS})+'\\n');
`);
 fs.chmodSync(mock,0o755);
 const env={...process.env,CI:'false',BURN_QA_BROWSER_BIN:mock,BURN_QA_SECRET:'must-not-leak'};
 const result=spawnSync(process.execPath,[runner,'http://127.0.0.1:8080'],{env,encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
 const calls=fs.readFileSync(log,'utf8').trim().split('\\n').map(JSON.parse);
 assert.deepEqual(calls.map(c=>c.args[0]),['open','set','screenshot','snapshot','set','screenshot','errors','close']);
 for(const c of calls){assert.equal(c.secret,undefined);assert.equal(c.allow,'127.0.0.1');}
 console.log('Browser QA command sequence and environment isolation fixture passed');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
