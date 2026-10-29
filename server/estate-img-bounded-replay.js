'use strict';
// Operator-invoked, bounded read-only historical ledger replay.
// Explicit range; no timers, background polling, or financial transactions.
function createImgBoundedReplay(scanner,{maxLedgers=25}={}){
 if(!scanner||typeof scanner.scan!=='function'||typeof scanner.current!=='function')throw new TypeError('scanner_required');
 if(!Number.isSafeInteger(maxLedgers)||maxLedgers<1||maxLedgers>100)throw new TypeError('invalid_replay_limit');
 async function run({startLedgerIndex,endLedgerIndex,signal}={}){
  if(!Number.isSafeInteger(startLedgerIndex)||startLedgerIndex<1||!Number.isSafeInteger(endLedgerIndex)||endLedgerIndex<startLedgerIndex||endLedgerIndex-startLedgerIndex+1>maxLedgers)throw new TypeError('invalid_or_unbounded_replay_range');
  const previous=scanner.current();
  if(previous&&startLedgerIndex!==previous.ledger_index+1)throw new Error('replay_must_resume_contiguously');
  const results=[];
  for(let index=startLedgerIndex;index<=endLedgerIndex;index++){
   if(signal?.aborted)throw new Error('replay_aborted');
   results.push(await scanner.scan(index));
  }
  return Object.freeze({startLedgerIndex,endLedgerIndex,processed:results.length,newReceipts:results.reduce((sum,r)=>sum+r.newReceipts,0),lastLedgerHash:results.at(-1).ledgerHash});
 }
 return Object.freeze({run});
}
module.exports={createImgBoundedReplay};
