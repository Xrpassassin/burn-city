'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateRlusdHourScanner:scanner,validatedLedger}=require('./estate-rlusd-validated-hour-scanner');
const POOL='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const IMG={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const RLUSD={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const EPOCH=946684800000,HOUR=3600000;
const startMs=Date.parse('2026-11-02T01:30:00Z');
const startHour=Date.parse('2026-11-02T02:00:00Z');
const h=n=>n.toString(16).padStart(64,'0').toUpperCase();
const ledgerMs={1000:startMs,1005:Date.parse('2026-11-02T02:30:00Z'),
 1010:Date.parse('2026-11-02T03:05:00Z'),
 1015:Date.parse('2026-11-02T04:05:00Z'),
 1017:Date.parse('2026-11-02T04:06:00Z')};
const ledger=index=>({validated:true,ledger_index:index,
 ledger:{ledger_index:index,ledger_hash:h(index),close_time:(ledgerMs[index]-EPOCH)/1000}});
const hash='A'.repeat(64);
const withdrawalTime=Date.parse('2026-11-02T02:45:00Z');
const transaction={hash,validated:true,ledger_index:1008,
 tx_json:{hash,TransactionType:'AMMWithdraw',Account:TREASURY,Asset:IMG,Asset2:RLUSD,
 date:(withdrawalTime-EPOCH)/1000},meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[]}};
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_rlusd_forward_reward_start(
 id INTEGER PRIMARY KEY,ledger_index INTEGER,ledger_hash TEXT,pool_account TEXT,
 ledger_close_time_ms INTEGER,first_eligible_hour_ms INTEGER,status TEXT
 );
 CREATE TABLE estate_hourly_payouts(id TEXT PRIMARY KEY,state TEXT);
 INSERT INTO estate_hourly_payouts VALUES('historical-claim','queued');`);
const addStart=db.prepare('INSERT INTO estate_rlusd_forward_reward_start VALUES(1,?,?,?,?,?,?)');
let ledgerHead=1017,incomplete=false,rejectNext=false;
const counters={accountTx:0};
const client={request:async q=>{
 if(q.command==='ledger'){
  const n=q.ledger_index==='validated'?ledgerHead:q.ledger_index;
  if(!ledgerMs[n])throw Error('missing_synthetic_ledger_'+n);
  return {result:ledger(n)};
 }
 if(q.command==='account_tx'){
  counters.accountTx++;
  if(rejectNext){rejectNext=false;throw Error('synthetic_rpc_outage');}
  const expected= q.ledger_index_min===1006&&q.ledger_index_max===1010;
  if(incomplete&&expected)return {result:{transactions:[],ledger_index_min:1006,ledger_index_max:1009}};
  const txs=expected?[{hash,validated:true,ledger_index:1008,tx_json:transaction.tx_json}]:[];
  return {result:{transactions:txs,
   ledger_index_min:q.ledger_index_min,ledger_index_max:q.ledger_index_max}};
 }
 if(q.command==='tx'){
  if(q.transaction!==hash)throw Error('unexpected_transaction_query');
  return {result:transaction};
 }
 throw Error('unexpected_xrpl_command_'+q.command);
}};
const make=()=>scanner({db,client,treasury:TREASURY,maxLedgers:5});
(async()=>{
 const first=make();
 assert.equal((await first.scan()).blocked,'immutable_forward_start_required');
 assert.equal(first.checkpoint(),null);
 addStart.run(1000,h(1000),POOL,startMs,startHour,'staged');
 assert.equal(validatedLedger(ledger(1000),1000).closeTimeMs,startMs);
 assert.throws(()=>validatedLedger({...ledger(1000),validated:false},1000),/exact_validated_ledger_required/);
 let r=await first.scan();
 assert.equal(r.checkpointLedger,1005);
 assert.equal(r.verifiedHoursClosed,0);
 assert.equal(first.hours().length,0);
 assert.equal(first.checkpoint().ledger_index,1005);
 // Intermittent RPC failure must preserve both prior checkpoint and closed-hour state.
 rejectNext=true;
 await assert.rejects(first.scan(),/synthetic_rpc_outage/);
 assert.equal(first.checkpoint().ledger_index,1005);
 assert.equal(first.hours().length,0);
 // Missing history tail must never allow advancing.
 incomplete=true;
 await assert.rejects(first.scan(),/account_history_range_not_proven/);
 assert.equal(first.checkpoint().ledger_index,1005);
 incomplete=false;
 r=await first.scan();
 assert.equal(r.checkpointLedger,1010);
 assert.equal(r.verifiedHoursClosed,1);
 assert.equal(r.withdrawalCandidatesFound,1);
 assert.equal(first.hours()[0].epoch_start_ms,startHour);
 assert.equal(first.hours()[0].withdrawal_candidates,1);
 assert.equal(first.hours()[0].source_status,'withdrawal_needs_cost_basis_review');
 assert.equal(first.candidates().length,1);
 assert.equal(first.candidates()[0].state,'basis_review_required');
 r=await first.scan();
 assert.equal(r.checkpointLedger,1015);
 assert.equal(r.verifiedHoursClosed,1);
 assert.equal(r.withdrawalCandidatesFound,0);
 assert.equal(first.hours()[1].epoch_start_ms,startHour+HOUR);
 assert.equal(first.hours()[1].source_status,'no_withdrawal_observed');
 const restarted=make();
 assert.equal((await restarted.scan()).blocked,'no_new_validated_ledger_range');
 assert.equal(restarted.hours().length,2);
 assert.equal(restarted.candidates().length,1);
 assert.equal(restarted.checkpoint().ledger_index,1015);
 assert.equal(db.prepare('SELECT state FROM estate_hourly_payouts').get().state,'queued');
 assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'estate_rlusd_%'").get().n>=3,true);
 db.prepare('UPDATE estate_rlusd_hour_scan_checkpoint SET ledger_hash=?').run('F'.repeat(64));
 await assert.rejects(restarted.scan(),/checkpoint_validation_mismatch/);
 assert.equal(restarted.hours().length,2);
 console.log('IMG/RLUSD validated hourly checkpoints: outage retry, incomplete history, restart, closed hours and no payments passed');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.close());
