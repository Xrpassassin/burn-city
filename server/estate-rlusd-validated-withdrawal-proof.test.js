'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {verifiedWithdrawalEvidence:verify,createEstateRlusdWithdrawalProofStore:create,IMG,RLUSD}
 =require('./estate-rlusd-validated-withdrawal-proof');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const POOL='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const LP='03'+'A'.repeat(38);
const TX='A'.repeat(64),EPOCH=1793664000000;
const asset=(currency,issuer,before,after)=>({ModifiedNode:{
 LedgerEntryType:'RippleState',
 FinalFields:{LowLimit:{issuer:TREASURY},HighLimit:{issuer},
  Balance:{currency,value:after}},
 PreviousFields:{Balance:{currency,value:before}}
}});
const paid=(amount,assetIssue,after)=>asset(assetIssue.currency,assetIssue.issuer,amount,after);
const tx={hash:TX,validated:true,ledger_index:1234,
 tx_json:{hash:TX,TransactionType:'AMMWithdraw',Account:TREASURY,Asset:IMG,Asset2:RLUSD,
  LPTokenIn:{currency:LP,issuer:POOL,value:'10'},Fee:'12'},
 meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[
  asset(LP,POOL,'100','90'),
  asset(IMG.currency,IMG.issuer,'200','250'),
  asset(RLUSD.currency,RLUSD.issuer,'2','2.125'),
  {ModifiedNode:{LedgerEntryType:'AccountRoot',
   FinalFields:{Account:TREASURY,Balance:'999988'},
   PreviousFields:{Balance:'1000000'}}}
 ]}};
const amm={validated:true,ledger_index:1234,
 amm:{account:POOL,lp_token:{issuer:POOL,currency:LP,value:'1000'}}};
const candidate={tx_hash:TX,ledger_index:1234,epoch_start_ms:EPOCH,pool_account:POOL,state:'basis_review_required'};
const args={candidate,receipt:tx,poolInfo:amm,treasury:TREASURY};
const proof=verify(args);
assert.equal(proof.lpBurned,'10');
assert.equal(proof.imgCredited,'50');
assert.equal(proof.rlusdCredited,'0.125');
assert.equal(proof.networkFeeDrops,'12');
assert.equal(proof.realizedNetProfitVerified,false);
assert.equal(proof.spendableRewardsAuthorized,false);
assert.equal(proof.state,'basis_review_required');
assert.throws(()=>verify({...args,receipt:{...tx,validated:false}}),/validated_img_rlusd_withdrawal_required/);
assert.throws(()=>verify({...args,receipt:{...tx,meta:{...tx.meta,TransactionResult:'tecFAILED'}}}),/validated_img_rlusd_withdrawal_required/);
assert.throws(()=>verify({...args,receipt:{...tx,tx_json:{...tx.tx_json,Account:POOL}}}),/validated_img_rlusd_withdrawal_required/);
assert.throws(()=>verify({...args,poolInfo:{...amm,ledger_index:1235}}),/same_ledger_pool_identity_required/);
assert.throws(()=>verify({...args,poolInfo:{...amm,amm:{...amm.amm,account:TREASURY}}}),/same_ledger_pool_identity_required/);
assert.throws(()=>verify({...args,receipt:{...tx,tx_json:{...tx.tx_json,LPTokenIn:{...tx.tx_json.LPTokenIn,issuer:TREASURY}}}}),/exact_pool_lp_burn_required/);
assert.throws(()=>verify({...args,receipt:{...tx,meta:{...tx.meta,AffectedNodes:tx.meta.AffectedNodes.slice(1)}}}),/unique_asset_delta_required/);
assert.throws(()=>verify({...args,receipt:{...tx,meta:{...tx.meta,AffectedNodes:[
 asset(LP,POOL,'100','90'),asset(IMG.currency,IMG.issuer,'200','250'),
 asset(RLUSD.currency,RLUSD.issuer,'2','1.9')]}}}),/positive_two_asset_receipt_required/);
assert.throws(()=>verify({...args,receipt:{...tx,tx_json:{...tx.tx_json,Fee:'1001'}}}),/withdrawal_fee_invalid_or_excessive/);
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_rlusd_withdrawal_candidates(
 tx_hash TEXT PRIMARY KEY,ledger_index INTEGER,epoch_start_ms INTEGER,pool_account TEXT,state TEXT);
 CREATE TABLE estate_rlusd_hour_scan_windows(epoch_start_ms INTEGER PRIMARY KEY);
 CREATE TABLE estate_hourly_payouts(id TEXT PRIMARY KEY,state TEXT);
 INSERT INTO estate_hourly_payouts VALUES('old-unpaid','queued');`);
db.prepare("INSERT INTO estate_rlusd_withdrawal_candidates VALUES(?,?,?,?,?)")
 .run(TX,1234,EPOCH,POOL,'basis_review_required');
let calls=0,broken=false;
const client={request:async q=>{
 calls++;
 if(broken&&q.command==='tx')throw Error('xrpl_fetch_failed');
 if(q.command==='tx')return {result:tx};
 if(q.command==='amm_info')return {result:amm};
 throw Error('unexpected_rpc_command');
}};
(async()=>{
 const service=create({db,client,treasury:TREASURY});
 assert.equal((await service.scan()).verifiedCandidateCount,0); // no completed hour yet
 assert.equal(service.list().length,0);
 db.prepare('INSERT INTO estate_rlusd_hour_scan_windows VALUES(?)').run(EPOCH);
 broken=true;
 await assert.rejects(service.scan(),/xrpl_fetch_failed/);
 assert.equal(service.list().length,0);
 assert.equal(db.prepare('SELECT state FROM estate_hourly_payouts').get().state,'queued');
 broken=false;
 const first=await service.scan();
 assert.equal(first.verifiedCandidateCount,1);
 assert.equal(first.remaining,0);
 assert.equal(first.realizedProfitProven,false);
 assert.equal(first.paymentsEnabled,false);
 assert.equal(service.list().length,1);
 assert.equal(JSON.parse(service.get(TX).proof_json).realizedNetProfitVerified,false);
 const priorCalls=calls;
 assert.equal((await create({db,client,treasury:TREASURY}).scan()).verifiedCandidateCount,0);
 assert.equal(calls,priorCalls,'restart must not re-fetch or duplicate immutable proof');
 assert.throws(()=>db.exec("UPDATE estate_rlusd_withdrawal_proofs SET state='paid'"),/immutable_withdrawal_proof/);
 assert.throws(()=>db.exec('DELETE FROM estate_rlusd_withdrawal_proofs'),/immutable_withdrawal_proof/);
 assert.equal(db.prepare('SELECT state FROM estate_hourly_payouts').get().state,'queued');
 db.close();
 console.log('IMG/RLUSD verified withdrawal: LP burn, both assets, ledger identity, outage and restart; no payouts passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
