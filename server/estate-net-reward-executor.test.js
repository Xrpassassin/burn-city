'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),xrpl=require('xrpl');
const {createEstateHourlyRuntime}=require('./estate-hourly-runtime');
const {createEstateNetRewardExecutor}=require('./estate-net-reward-executor');
const {rewardImgLiabilityUnits,rewardCashReserve}=require('./estate-reward-reserves');
const {value}=require('./estate-liquidity-ledger');
function fixture(currency='IMG',budget='1000000'){
 const db=new DatabaseSync(':memory:'),w=xrpl.Wallet.generate(),owner=xrpl.Wallet.generate().classicAddress,issuer=xrpl.Wallet.generate().classicAddress,treasury=w.classicAddress,h='A'.repeat(64);
 db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,share_units INTEGER,purchased_at INTEGER);CREATE TABLE estate_owner_payout_preferences(acct TEXT PRIMARY KEY,currency TEXT);');
 let paused=false,validated=true,failSubmit=false,badDelivery=false,failed=false,missingLine=false,fee='12',submits=0,img=value('10'),xrp=100000000n;const proofs=new Map();
 const client={autofill:async t=>({...t,Fee:fee,Sequence:submits+1,LastLedgerSequence:120}),request:async q=>{
  if(q.command==='ledger')return {result:{validated:true,ledger_hash:h,ledger_index:100}};
  if(q.command==='account_info')return {result:{validated:true,ledger_hash:h,account_data:{Account:q.account,Flags:0}}};
  if(q.command==='account_lines')return {result:{validated:true,ledger_hash:h,lines:missingLine&&q.account===owner?[]:[{currency:'IMG',account:issuer,balance:q.account===treasury?img.toFixed():'0',limit:'1000'}]}};
  if(q.command==='amm_info')return {result:{validated:true,ledger_hash:h,amm:{amount:'1000000',amount2:{currency:'IMG',issuer,value:'100'},trading_fee:300}}};
  if(q.command==='tx'){const r=structuredClone(proofs.get(q.transaction));r.validated=validated;if(badDelivery)r.meta.delivered_amount='1';return {result:r};}
  if(q.command==='submit'){
   submits++;const tx=xrpl.decode(q.tx_blob),hash=xrpl.hashes.hashSignedTx(q.tx_blob),beforeXrp=xrp,beforeImg=img;
   const convert=tx.Destination===treasury;let debit=value('0');
   if(!failed){if(convert){debit=value(tx.SendMax.value).times('0.9');xrp+=BigInt(tx.Amount);}else if(typeof tx.Amount==='string')xrp-=BigInt(tx.Amount);else debit=value(tx.Amount.value);img=img.minus(debit);}
   xrp-=BigInt(tx.Fee);
   const nodes=[{ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:treasury,Balance:String(xrp)},PreviousFields:{Balance:String(beforeXrp)}}}];
   if(debit.gt(0))nodes.push({ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{LowLimit:{issuer:treasury},HighLimit:{issuer},Balance:{currency:'IMG',value:img.toFixed()}},PreviousFields:{Balance:{currency:'IMG',value:beforeImg.toFixed()}}}});
   if(!convert&&typeof tx.Amount!=='string'&&!failed)nodes.push({ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:{LowLimit:{issuer:owner},HighLimit:{issuer},Balance:{currency:'IMG',value:tx.Amount.value}},PreviousFields:{Balance:{currency:'IMG',value:'0'}}}});
   const raw=structuredClone(tx);raw.Memos=raw.Memos.map(({Memo})=>({Memo:{MemoData:Memo.MemoData,MemoType:Memo.MemoType}}));raw.DeliverMax=raw.Amount;delete raw.Amount;
   proofs.set(hash,{hash,validated:true,ledger_index:101,date:800000000,tx_json:raw,meta:{TransactionResult:failed?'tecPATH_DRY':'tesSUCCESS',delivered_amount:tx.Amount,AffectedNodes:nodes}});
   if(failSubmit)throw Error('ambiguous_submit');return {result:{engine_result:failed?'tecPATH_DRY':'tesSUCCESS'}};
  }
  throw Error(q.command);
 }};
 const runtime=createEstateHourlyRuntime({db,client,treasury,imgIssuer:issuer});
 db.prepare('INSERT INTO estate_owner_payout_preferences VALUES(?,?)').run(owner,currency);
 function enqueue(hour=0,n=budget){db.prepare('INSERT INTO estate_img_hourly_batches VALUES(?,?,?,?,?,?)').run(hour,n,1,1,'digest'+hour,hour+3600000);db.prepare('INSERT INTO estate_img_hourly_entitlements VALUES(?,?,?)').run(hour,owner,n);runtime.enqueue(hour);}
 enqueue();
 const make=(enabled=true)=>createEstateNetRewardExecutor({db,client,wallet:()=>w,treasury,imgIssuer:issuer,guard:{paused:()=>paused,check:async()=>null},enabled});
 const payout=()=>db.prepare('SELECT * FROM estate_hourly_payouts ORDER BY epoch_start_ms DESC LIMIT 1').get();
 async function settle(){for(let i=0;i<12;i++){await make().tick();if(payout().state==='confirmed')return;}throw Error('not_settled:'+JSON.stringify(payout()));}
 return {db,make,payout,enqueue,settle,owner,get submits(){return submits;},get xrp(){return xrp;},get img(){return img;},set paused(v){paused=v;},set validated(v){validated=v;},set failSubmit(v){failSubmit=v;},set badDelivery(v){badDelivery=v;},set failed(v){failed=v;},set missingLine(v){missingLine=v;},set fee(v){fee=v;}};
}
(async()=>{
 for(const currency of ['IMG','XRP']){
  const f=fixture(currency),start=f.xrp;await f.settle();const row=f.payout(),s=f.make().settlement(row.id);
  assert.equal(f.submits,2);assert.equal(s.state,'paid');assert.equal(s.fee_paid_drops,'24');assert.equal(s.unrecovered_fee_drops,'0');assert(f.xrp>=start,'actual earned conversion covers both fees and payment');
  assert.equal(rewardCashReserve(f.db),f.xrp-start);assert.equal(rewardImgLiabilityUnits(f.db),BigInt(row.remainder_img_units));
  const delivered=JSON.parse(row.delivered);assert.equal(typeof delivered,currency==='XRP'?'string':'object');
  if(currency==='IMG'){assert.equal(row.spent_img_units,'1000000');assert.equal(row.remainder_img_units,'0');assert(BigInt(s.converted_img_units)>0n);assert(value(delivered.value).lt(1));}
  else{assert.equal(row.remainder_img_units,'100000');assert.equal(BigInt(delivered)+24n+rewardCashReserve(f.db),BigInt(JSON.parse(f.db.prepare("SELECT draft_json FROM estate_treasury_transactions WHERE purpose='hourly_reward_convert'").get().draft_json).Amount));}
  await f.make().tick();assert.equal(f.submits,2,'restart cannot duplicate either transaction');
  if(currency==='IMG'){f.enqueue(3600000);await f.settle();assert.equal(f.submits,3,'existing owner XRP fee credit avoids a second fee conversion');assert.equal(f.xrp-start,rewardCashReserve(f.db));}
 }
 const a=fixture();a.failSubmit=true;a.validated=false;await a.make().tick();assert.equal(a.submits,1);await a.make().tick();assert.equal(a.submits,1);a.validated=true;a.paused=true;await a.make(false).tick();assert.equal(a.submits,1);assert.equal(a.make().settlement(a.payout().id).state,'funded');a.paused=false;a.failSubmit=false;await a.settle();assert.equal(a.submits,2);
 const small=fixture('XRP','100');await small.make().tick();assert.equal(small.submits,0);assert.equal(small.payout().note,'below_net_reward_minimum_carried');assert.equal(rewardImgLiabilityUnits(small.db),100n);small.enqueue(3600000,'1000000');assert.equal(small.payout().img_units,'1000100');await small.settle();assert.equal(small.submits,2);
 const missing=fixture();missing.missingLine=true;await missing.make().tick();assert.equal(missing.submits,0);assert.equal(missing.payout().note,'recipient_img_trustline_unavailable');
 const capital=fixture();capital.db.exec("CREATE TABLE estate_liquidity_jobs(data_json TEXT);");capital.db.prepare('INSERT INTO estate_liquidity_jobs VALUES(?)').run(JSON.stringify({img:'9.5',residualImg:'0'}));await capital.make().tick();assert.equal(capital.submits,0);assert.equal(capital.payout().note,'unfunded_img_liabilities','principal inventory cannot replace missing rewards');
 const concurrent=fixture();await Promise.all([concurrent.make().tick(),concurrent.make().tick()]);assert.equal(concurrent.submits,1,'independent workers claim one durable conversion');
 const expensive=fixture();expensive.fee='101';await expensive.make().tick();assert.equal(expensive.submits,0);assert.equal(expensive.payout().note,'unsafe_transaction_envelope');
 const corrupt=fixture();await corrupt.make().tick();corrupt.badDelivery=true;await assert.rejects(()=>corrupt.make().tick(),/conversion_proof_mismatch/);assert.equal(corrupt.payout().state,'queued');assert.equal(corrupt.submits,1);
 const failed=fixture();failed.failed=true;await failed.make().tick();await failed.make().tick();const held=failed.make().settlement(failed.payout().id);assert.equal(held.state,'held');assert.equal(held.unrecovered_fee_drops,'12');await failed.make().tick();assert.equal(failed.submits,1,'validated failure never auto-resigns');assert.equal(failed.make().settlement(failed.payout().id).fee_paid_drops,'12');
 console.log('Net hourly rewards: earned-fee funding, IMG and XRP wallet delivery, exact fee accounting, protected credits, tiny reward carry, restart/unknown outcomes, failed fees and proof rejection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
