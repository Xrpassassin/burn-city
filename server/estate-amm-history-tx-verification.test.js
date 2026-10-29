'use strict';
const assert=require('node:assert/strict');
const {verifyStoredAmmHistoryEntry:verify}=require('./estate-amm-history-tx-verification');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',plxIssuer='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',ammAccount=imgIssuer,lpCurrency='03'+'A'.repeat(38),hash='A'.repeat(64);
const config={treasury,imgIssuer,plxIssuer};
const node=(currency,issuer,before,after)=>({ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{LowLimit:{issuer:treasury},HighLimit:{issuer},Balance:{currency,value:after}},PreviousFields:{Balance:{currency,value:before}}}});
const identity={validated:true,ledger_index:200,amm:{account:ammAccount,amount:{currency:'IMG',issuer:imgIssuer,value:'100'},amount2:{currency:'PLX',issuer:plxIssuer,value:'100'},lp_token:{currency:lpCurrency,issuer:ammAccount,value:'50'}}};
const tx={validated:true,ledger_index:100,hash,tx_json:{TransactionType:'AMMDeposit',Account:treasury,Asset:{currency:'IMG',issuer:imgIssuer},Asset2:{currency:'PLX',issuer:plxIssuer}},meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[node('IMG',imgIssuer,'100','90'),node('PLX',plxIssuer,'100','80'),node(lpCurrency,ammAccount,'0','5')]}};
const client={request:async req=>({result:req.command==='amm_info'?identity:tx})};
async function main(){
 const r=await verify(client,{hash,ledgerIndex:100,validated:true},config);
 assert.equal(r.storedHashVerified,true);assert.equal(r.storedLedgerVerified,true);assert.equal(r.distributable,false);
 await assert.rejects(()=>verify(client,{hash,ledgerIndex:101,validated:true},config),/stored_history_transaction_mismatch/);
 await assert.rejects(()=>verify(client,{hash,ledgerIndex:100,validated:false},config),/stored_entry_not_validated/);
 console.log('Stored AMM history transaction verification tests passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
