'use strict';
const assert=require('node:assert/strict');
const {createImgBoundedReplay}=require('./estate-img-bounded-replay');
(async()=>{
 let last=99;
 const scanner={current:()=>({ledger_index:last}),scan:async index=>{assert.equal(index,last+1);last=index;return {newReceipts:index===101?2:0,ledgerHash:'A'.repeat(64)}}};
 const replay=createImgBoundedReplay(scanner,{maxLedgers:3});
 assert.deepEqual(await replay.run({startLedgerIndex:100,endLedgerIndex:102}),{startLedgerIndex:100,endLedgerIndex:102,processed:3,newReceipts:2,lastLedgerHash:'A'.repeat(64)});
 await assert.rejects(()=>replay.run({startLedgerIndex:103,endLedgerIndex:106}),/invalid_or_unbounded_replay_range/);
 await assert.rejects(()=>replay.run({startLedgerIndex:104,endLedgerIndex:104}),/replay_must_resume_contiguously/);
 await assert.rejects(()=>replay.run({startLedgerIndex:103,endLedgerIndex:103,signal:{aborted:true}}),/replay_aborted/);
 assert.equal(last,102);
 console.log('Bounded IMG ledger replay tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
