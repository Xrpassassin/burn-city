'use strict';
const assert=require('node:assert/strict');
const {inspect}=require('../scripts/estate-legacy-plx-conversion-evidence.cjs');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',hash='2762310505CB5C6B4F556C77CACDDD114281331F90F6964BCBBB5B5297D82F3C';
function line(currency,issuer,before,after){return {ModifiedNode:{
 LedgerEntryType:'RippleState',PreviousFields:{Balance:{currency,value:before}},
 FinalFields:{Balance:{currency,value:after},LowLimit:{issuer:treasury},HighLimit:{issuer}}}};}
const tx={validated:true,ledger_index:108015970,hash,
 tx_json:{Account:treasury,Destination:treasury,TransactionType:'Payment',Fee:'12'},
 meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[
 line('PLX','rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q','20000','6669.6544373314'),
 line('524C555344000000000000000000000000000000','rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De','10','13'),
 {ModifiedNode:{LedgerEntryType:'AccountRoot',
 PreviousFields:{Balance:'2000000'},FinalFields:{Account:treasury,Balance:'1999988'}}}
 ]}};
const r=inspect(tx);
assert.equal(r.ledgerBalanceChanges.PLX,'-13330.3455626686');
assert.equal(r.ledgerBalanceChanges.RLUSD,'3');
assert.equal(r.ledgerBalanceChanges.IMG,'0');
assert.equal(r.xrpTransferDeltaDrops,'0');
assert.equal(r.tokenOutputsObserved.length,1);
const xrpPayout={...tx,meta:{...tx.meta,AffectedNodes:[
 tx.meta.AffectedNodes[0],
 {ModifiedNode:{LedgerEntryType:'AccountRoot',
  PreviousFields:{Balance:'2000000'},
  FinalFields:{Account:treasury,Balance:'4397649'}}}
]}};
const realized=inspect(xrpPayout);
assert.equal(realized.xrpTransferDeltaDrops,'2397661');
assert.deepEqual(realized.tokenOutputsObserved,[{asset:'XRP',receivedDrops:'2397661'}]);
assert.equal(realized.customerOwnershipAttributionVerified,false);
assert.equal(r.customerOwnershipAttributionVerified,false);
assert.equal(r.treasuryPauseReleaseAuthorized,false);
assert.throws(()=>inspect({...tx,validated:false}),/validated_self_payment_required/);
assert.throws(()=>inspect({...tx,tx_json:{...tx.tx_json,Destination:'rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ'}}),/validated_self_payment_required/);
assert.throws(()=>inspect({...tx,meta:{...tx.meta,TransactionResult:'tecPATH_DRY'}}),/validated_self_payment_required/);
assert.throws(()=>inspect({...tx,meta:{...tx.meta,AffectedNodes:tx.meta.AffectedNodes.slice(1)}}),/plx_debit_missing/);
console.log('PLX conversion: validated self-payment debits and actual token output checks passed');
