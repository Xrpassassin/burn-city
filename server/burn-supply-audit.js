'use strict';
const {reconcileBurnSupply}=require('./burn-supply-reconciliation');
const launchEvidence=require('./burn-launch-baseline.json');
const {BURN_ISSUER:issuer}=require('./issuer-return-history');
async function auditBurnSupply({rpc,maxEscrowPages=20,now=Date.now()}={}){
 if(typeof rpc!=='function')throw Error('read-only RPC function required');
 const unwrap=x=>x?.result||x;
 const info=unwrap(await rpc('server_info',{})),pin=info.info?.validated_ledger?.seq;
 const hash=info.info?.validated_ledger?.hash;
 if(info.info?.network_id!==0||!Number.isSafeInteger(pin)||!/^[A-Fa-f0-9]{64}$/.test(hash||''))throw Error('validated mainnet ledger hash unavailable');
 const ledger={ledger_hash:hash};
 const current=unwrap(await rpc('account_info',{account:issuer,...ledger,signer_lists:true}));
 const gateway=unwrap(await rpc('gateway_balances',{account:issuer,...ledger,strict:true}));
 const escrowPages=[];let marker;
 for(let i=0;i<maxEscrowPages;i++){
  const r=unwrap(await rpc('account_objects',{account:issuer,...ledger,type:'escrow',limit:400,...(marker?{marker}:{})}));
  escrowPages.push(r);marker=r.marker;if(!marker)break;
 }
 return reconcileBurnSupply({launchEvidence,current,gateway,escrowPages,pinnedLedger:{index:pin,hash},now});
}
module.exports={auditBurnSupply};
