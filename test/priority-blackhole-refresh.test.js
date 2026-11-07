'use strict';
// A large pool scan must not block the tower singularities after boot.
const assert = require('node:assert/strict');
const G = require('../client/js/goldlock.js');
const {create} = require('../server/amm-lock');
(async () => {
  const immIssuer='rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP';
  const pyroIssuer='rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va';
  const pyroCur='58525079726F0000000000000000000000000000';
  const obligations={IMM:'800543718745024.9',[pyroCur]:'0.6054112530289129'};
  let signalPoolStarted;
  const poolStarted=new Promise(resolve=>{signalPoolStarted=resolve;});
  let releasePool;
  const pendingPool=new Promise(resolve=>{releasePool=resolve;});
  const calls=[];
  const rpc=async (method,params) => {
    calls.push([method,params.account || params.amm_account || '']);
    if(method==='gateway_balances')
      return {obligations:{[params.account===immIssuer?'IMM':pyroCur]:
        params.account===immIssuer?obligations.IMM:obligations[pyroCur]}};
    if(method==='account_lines')return {lines:[]};
    if(method==='account_info')return {account_data:{Account:params.account,Flags:G.LSF_DISABLE_MASTER},signer_lists:[]};
    if(method==='amm_info') {
      signalPoolStarted();
      await pendingPool;
      return {amm:{lp_token:{currency:'LP',value:'100'}},ledger_index:108000000};
    }
    if(method==='account_objects')return {account_objects:[]};
    throw Error('unexpected XRPL command: '+method);
  };
  const instance=create({rpc,gap:0});
  const nodes=[
    {name:'IMM',key:immIssuer+'-IMM'},
    {name:'XRPyro',key:pyroIssuer+'-'+pyroCur},
    {name:'IMM',key:'wrong-IMM'} // wrong-issuer duplicate cannot override verified tower
  ];
  const refresh=instance.refresh(()=>({nodes,pools:[{amm:'rPoolTest',a:'IMM',b:'XRPyro',locked_pct:0}]}));
  await Promise.race([poolStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('pool was not started')),3000))]);
  const snap=instance.snapshot();
  assert.equal(snap.running,true);
  assert.equal(snap.last_ok,null);
  assert.equal(Object.keys(snap.pools).length,0,'slow pool deliberately blocked');
  assert.deepEqual(Object.keys(snap.tokens),['XRPyro','IMM']);
  assert.equal(snap.tokens.IMM.issuer,immIssuer);
  assert.equal(snap.tokens.XRPyro.issuer,pyroIssuer);
  assert.equal(snap.tokens.IMM.supply,800543718745024.9);
  assert.equal(snap.tokens.XRPyro.supply,0.6054112530289129);
  assert.equal(snap.tokens.IMM.status,'verified');
  assert.equal(snap.tokens.XRPyro.status,'verified');
  assert.equal(snap.tokens.IMM.issuer_keys_disabled,true);
  assert.equal(snap.tokens.XRPyro.issuer_keys_disabled,true);
  const poolIndex=calls.findIndex(([method])=>method==='amm_info');
  assert.ok(poolIndex>0);
  assert.equal(calls.slice(poolIndex+1).filter(([method])=>method==='gateway_balances').length,0);
  releasePool();
  await refresh;
  const finished=instance.snapshot();
  assert.equal(finished.running,false);
  assert.ok(finished.last_ok);
  assert.equal(Object.keys(finished.pools).length,1);
  assert.equal(finished.tokens.XRPyro.issuer,pyroIssuer);
  console.log('Priority tower token refresh completes before slow pool scans');
})().catch(e=>{console.error(e);process.exitCode=1;});
