'use strict';
const assert=require('node:assert/strict');
const {snapshotPool,historicCoverage}=require('./estate-replacement-custody-snapshot');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const pool='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const img={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const rlusd={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const hash='0383CE00506A32900ADE91477C8761466F8D1D65';
const report=balance=>({
 poolAccount:pool,ledgerIndex:109,
 expectedAssets:[img,rlusd],
 ammResult:{validated:true,ledger_index:109,amm:{account:pool,
  amount:{...img,value:'3100'},amount2:{...rlusd,value:'3.106054465'},
  lp_token:{currency:hash,issuer:pool,value:'200'}}},
 linesResult:{validated:true,ledger_index:109,lines:[{account:pool,currency:hash,balance}]}
});
const r=snapshotPool(report('100'));
assert.equal(r.treasuryLpHeld,'100');
assert.equal(r.grossTreasuryShareRatio,'0.5');
assert.equal(r.assets.find(x=>x.currency==='IMG').grossTreasuryProRata,'1550');
assert.equal(r.assets.find(x=>x.currency===rlusd.currency).grossTreasuryProRata,'1.5530272325');
assert.equal(r.replacementCapitalProven,false);
assert.equal(r.treasuryReleaseAuthorized,false);
assert.equal(snapshotPool({...report('100'),linesResult:{validated:true,ledger_index:109,lines:[]}}).treasuryLpHeld,'0');
assert.throws(()=>snapshotPool(report('201')),/exceeds_total_supply/);
assert.throws(()=>snapshotPool({...report('100'),linesResult:{validated:true,ledger_index:110,lines:[]}}),/incomplete_same_ledger_snapshot/);
assert.throws(()=>snapshotPool({...report('100'),linesResult:{validated:true,ledger_index:109,lines:[],marker:{cursor:1}}}),/incomplete_same_ledger_snapshot/);
assert.throws(()=>snapshotPool({...report('100'),ammResult:{...report('100').ammResult,validated:false}}),/incomplete_same_ledger_snapshot/);
assert.throws(()=>snapshotPool({...report('100'),ammResult:{validated:true,ledger_index:109,amm:{...report('100').ammResult.amm,account:treasury}}}),/pool_or_lp_issuer_mismatch/);
assert.throws(()=>snapshotPool({...report('100'),expectedAssets:[{currency:'XRP'},{currency:'XRP'}]}),/unexpected_pool_asset_pair/);
assert.throws(()=>snapshotPool({...report('100'),linesResult:{validated:true,ledger_index:109,lines:[
 {account:pool,currency:hash,balance:'1'},{account:pool,currency:hash,balance:'2'}]}}),/ambiguous_lp_trustline/);
assert.throws(()=>snapshotPool({...report('100'),linesResult:{validated:true,ledger_index:109,lines:[
 {account:pool,currency:hash,balance:'-2'}]}}),/invalid_nonnegative_balance/);
const fake=x=>({treasuryLpHeld:x});
const old=historicCoverage({oldImgPlx:fake('0'),oldImgXrp:fake('1057422.96985061'),
 newImgRlusd:fake('98.1262902666762'),recordedPlxLp:'1940.67982383456',
 recordedImgXrpLp:'11157.61391981'});
assert.equal(old.legacyPlxLpCovered,false);
assert.equal(old.legacyImgXrpLpCovered,true);
assert.equal(old.newImgRlusdLpPresent,true);
assert.equal(old.newImgRlusdCustomerAttributionVerified,false);
assert.equal(old.legacyCustomerObligationReconciled,false);
assert.equal(old.purchaseActivationAuthorized,false);
assert.equal(historicCoverage({oldImgPlx:fake('1941'),oldImgXrp:fake('11158'),newImgRlusd:fake('100'),
 recordedPlxLp:'1940.67982383456',recordedImgXrpLp:'11157.61391981'}).legacyCustomerObligationReconciled,false);
console.log('Validated LP custody and reserve-share snapshot tests passed; migration stays unverified');
