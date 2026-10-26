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
