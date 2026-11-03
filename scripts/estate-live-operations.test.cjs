'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const target='a'.repeat(40);
// Every historic confirmation phrase, even with a valid SHA and Fly token,
// must fail BEFORE the first remote API call or machine environment mutation.
const mock=`globalThis.fetch=async()=>{throw Error('remote_call_must_never_run')};`;
for(const phrase of [
 '70-30-realized-earnings-only',
 'IMG-RLUSD',
 '',
]){
 const result=spawnSync(process.execPath,[
  '--import','data:text/javascript,'+encodeURIComponent(mock),
  'scripts/estate-live-operations.mjs'
 ],{encoding:'utf8',timeout:6000,env:{
  ...process.env,ESTATE_EXPECTED_COMMIT:target,
  FLY_API_TOKEN:'fixture-not-a-real-token',
  CONFIRM_ESTATES_ACTIVATION:phrase}});
 assert.equal(result.status,1,result.stdout);
 assert.match(result.stderr,/legacy_70_30_pollux_activation_retired_use_img_rlusd_preflight/);
 assert.doesNotMatch(result.stderr,/remote_call_must_never_run/);
}
const source=fs.readFileSync('scripts/estate-live-ops.cjs','utf8');
for(const mode of ['preflight','bootstrap','unpause']){
 const result=spawnSync(process.execPath,['-e',source,mode,target],{
  encoding:'utf8',timeout:6000,env:{...process.env,DATA_DIR:'/nonexistent-legacy-fixture'}});
 assert.equal(result.status,1,result.stdout);
 assert.match(result.stderr,/legacy_pollux_activation_and_unpause_retired/);
 assert.doesNotMatch(result.stderr,/ENOENT|EACCES/,'legacy modes must fail before production file reads');
}
console.log('Retired Pollux activation: no remote calls, unpause, bootstrap or legacy trading permitted');
