'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {splitImgAmount}=require('./estate-img-amount');
const {createImgHourlyRewardLedger}=require('./estate-img-hourly-rewards');
const {createImgHistoricalBootstrap}=require('./estate-img-historical-bootstrap');
const {createImgValidatedLedgerScanner}=require('./estate-img-validated-ledger-scanner');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
const source='r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V',ledgerIndex=101,closeTime=900000000;
const config={treasury,imgIssuer,allowedSources:[source]};
// Actual delivery observed at ledger 107987683, tx 84C32FA3...86EE54.
const amount='0.31949269804787';
assert.deepEqual(splitImgAmount(amount),{exact:amount,units:'319492',dust:'0.00000069804787'});
assert.deepEqual(splitImgAmount('1e-7'),{exact:'0.0000001',units:'0',dust:'0.0000001'});
assert.deepEqual(splitImgAmount('1.0000010000'),{exact:'1.000001',units:'1000001',dust:'0'});
for(const bad of ['0','-1','1e999','NaN','1.2.3',' 1','1e-999'])assert.throws(()=>splitImgAmount(bad));
function setup({badIgnoredLedger=false,unavailable=false}={}){
 const db=new DatabaseSync(':memory:');
 createImgHistoricalBootstrap(db).configure({...config,startLedgerIndex:ledgerIndex,startLedgerHash:'B'.repeat(64),confirmedOnChain:true});
 const entries=['1','2','3'].map(c=>({hash:c.repeat(64),TransactionType:'Payment',Account:source,Destination:treasury}));
 const client={request:async q=>{
  if(q.command==='ledger')return {result:{validated:true,ledger:{ledger_index:ledgerIndex,ledger_hash:'B'.repeat(64),parent_hash:'C'.repeat(64),transaction_hash:'D'.repeat(64),close_time:closeTime,transactions:entries.map(e=>e.hash)}}};
  if(q.command==='account_tx')return {result:{validated:true,account:treasury,ledger_index_min:ledgerIndex,ledger_index_max:ledgerIndex,transactions:entries.map(tx=>({validated:true,ledger_index:ledgerIndex,hash:tx.hash,tx_json:tx}))}};
  const i=entries.findIndex(e=>e.hash===q.transaction);
  return {result:{...entries[i],validated:true,ledger_index:badIgnoredLedger&&i===1?102:ledgerIndex,date:closeTime,
   meta:{TransactionResult:i===2?'tecPATH_DRY':'tesSUCCESS',delivered_amount:i===0?{currency:'IMG',issuer:imgIssuer,value:amount}:unavailable?'unavailable':'6'}}};
 }};
 return {db,scanner:createImgValidatedLedgerScanner({db,client,...config})};
}
(async()=>{
 const {db,scanner}=setup();
 assert.equal((await scanner.scan(ledgerIndex)).newReceipts,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_img_reward_receipts').get().n,1);
 assert.equal(db.prepare('SELECT amount_units FROM estate_img_reward_receipts').get().amount_units,'319492');
 assert.deepEqual({...db.prepare('SELECT exact_amount,dust_amount FROM estate_img_reward_precision').get()},{exact_amount:amount,dust_amount:'0.00000069804787'});
 assert.equal(scanner.current().ledger_index,ledgerIndex);
 const reopened=createImgHourlyRewardLedger(db,config);
 const receipt={txHash:'1'.repeat(64),ledgerIndex,source,destination:treasury,issuer:imgIssuer,amount,receivedAtMs:(closeTime+946684800)*1000,verified:true};
 assert.equal(reopened.record(receipt).inserted,false);
 assert.throws(()=>reopened.record({...receipt,amount:'0.31949269804788'}),/reward_hash_conflict/);
 // Sub-micro receipts remain auditable but cannot fund even one micro-unit.
 reopened.record({...receipt,txHash:'4'.repeat(64),amount:'1e-7'});
 assert.equal(db.prepare('SELECT amount_units FROM estate_img_reward_receipts WHERE tx_hash=?').get('4'.repeat(64)).amount_units,'0');
 for(const opts of [{badIgnoredLedger:true},{unavailable:true}]){
  const bad=setup(opts);
  await assert.rejects(()=>bad.scanner.scan(ledgerIndex));
  assert.equal(bad.scanner.current(),null);
  assert.equal(bad.db.prepare('SELECT COUNT(*) n FROM estate_img_reward_precision').get().n,0);
 }
 // A failed precision insert must roll back its associated funding receipt.
 db.exec("CREATE TRIGGER reject_precision BEFORE INSERT ON estate_img_reward_precision BEGIN SELECT RAISE(ABORT,'test_failure'); END");
 assert.throws(()=>reopened.record({...receipt,txHash:'5'.repeat(64)}),/test_failure/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_img_reward_receipts WHERE tx_hash=?').get('5'.repeat(64)).n,0);
 console.log('Live Pollux precision, dust, mixed-asset coverage and atomic replay tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
