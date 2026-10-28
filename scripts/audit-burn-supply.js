'use strict';
// BURN-only read-only audit. Small pinned-ledger snapshot; never scans account_tx.
const {reconcileBurnSupply}=require('../server/burn-supply-reconciliation');
const launchEvidence=require('../server/burn-launch-baseline.json');
const {BURN_ISSUER:issuer}=require('../server/issuer-return-history');
async function auditBurnSupply({rpc,maxEscrowPages=20,now=Date.now()}={}){
 if(typeof rpc!=='function')throw Error('read-only RPC function required');
 const unwrap=x=>x?.result||x;
 const info=unwrap(await rpc('server_info',{})),pin=info.info?.validated_ledger?.seq;
 if(info.info?.network_id!==0||!Number.isSafeInteger(pin))throw Error('validated mainnet ledger unavailable');
 const current=unwrap(await rpc('account_info',{account:issuer,ledger_index:pin,signer_lists:true}));
 const gateway=unwrap(await rpc('gateway_balances',{account:issuer,ledger_index:pin,strict:true}));
 const escrowPages=[];let marker;
 for(let i=0;i<maxEscrowPages;i++){
  const r=unwrap(await rpc('account_objects',{account:issuer,ledger_index:pin,type:'escrow',limit:400,...(marker?{marker}:{})}));
  escrowPages.push(r);marker=r.marker;if(!marker)break;
 }
 return reconcileBurnSupply({launchEvidence,current,gateway,escrowPages,now});
}
async function rpc(method,params){
 if(!['server_info','account_info','gateway_balances','account_objects'].includes(method))throw Error('method not allowed in read-only supply audit');
 const response=await fetch('https://xrplcluster.com/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('RPC HTTP '+response.status);const r=await response.json();if(r.result?.error||!r.result)throw Error(r.result?.error||'empty RPC');return r.result;
}
if(require.main===module)auditBurnSupply({rpc}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={auditBurnSupply};
