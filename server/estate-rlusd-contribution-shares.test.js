'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateCapitalAllocation}=require('./estate-capital-allocation');
const {contributionSnapshot,allocateBySettledContributions,previewFutureProfitDistribution:preview}
 =require('./estate-rlusd-contribution-shares');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_property_ownership(
 property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,
 purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL);`);
const A='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',B='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',
 C='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const ancient=1000000,future=2000000,later=3000000;
const purchases=[
 {property:'trailer-01',hash:'A'.repeat(64),owner:A,drops:3000000,weight:1,when:ancient,policy:1},
 {property:'apartment-01',hash:'B'.repeat(64),owner:B,drops:15000000,weight:5,when:future,policy:2},
 {property:'trailer-02',hash:'C'.repeat(64),owner:B,drops:3000000,weight:1,when:later,policy:2},
 {property:'starter-01',hash:'D'.repeat(64),owner:C,drops:75000000,weight:25,when:later,policy:2}
];
const insert=db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)');
for(const p of purchases){
 insert.run(p.property,p.owner,p.hash,p.drops,p.weight,p.when);
 createEstateCapitalAllocation(db,{policyVersion:p.policy}).record({
  property_id:p.property,acct:p.owner,purchase_tx:p.hash,purchase_amount_drops:p.drops
 });
}
let s=contributionSnapshot(db,ancient);
assert.equal(s.length,1);
assert.equal(s[0].policyVersion,1,'old owner eligible for future ownership shares without moving original capital');
assert.equal(preview(db,{realizedAtMs:ancient,realizedProfitUnits:'100'}).owners[0].previewUnits,'100');
s=contributionSnapshot(db,future);
assert.equal(s.length,2);
const x=allocateBySettledContributions({units:'1000',contributions:s});
assert.equal(x.totalEligibleContributionDrops,'18000000');
assert.equal(x.owners.find(x=>x.owner===A).previewUnits,'167');
assert.equal(x.owners.find(x=>x.owner===B).previewUnits,'833');
assert.equal(x.allocationIsNonpayingPreview,true);
assert.equal(x.originalPurchaseCapitalNotRebooked,true);
const all=preview(db,{realizedAtMs:later,realizedProfitUnits:'9600'});
assert.equal(all.totalEligibleContributionDrops,'96000000');
assert.equal(all.owners.find(x=>x.owner===A).previewUnits,'300');
assert.equal(all.owners.find(x=>x.owner===B).previewUnits,'1800');
assert.equal(all.owners.find(x=>x.owner===C).previewUnits,'7500');
assert.equal(all.owners.reduce((a,b)=>a+BigInt(b.previewUnits),0n),9600n);
assert.equal(all.contributionsRecorded,4);
assert.equal(preview(db,{realizedAtMs:future-1,realizedProfitUnits:'100'}).owners.length,1);
assert.deepEqual(allocateBySettledContributions({units:'0',contributions:[]}).owners,[]);
assert.throws(()=>allocateBySettledContributions({units:'1',contributions:[]}),/no_settled_contributors/);
assert.throws(()=>allocateBySettledContributions({units:'1',contributions:[s[0],s[0]]}),/invalid_contribution/);
assert.throws(()=>preview(db,{realizedAtMs:-1,realizedProfitUnits:'100'}),/settled_contribution_snapshot_required/);
assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_capital_allocations').get().n,4);
assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE '%payout%'").get().n,0);
db.prepare("UPDATE estate_capital_allocations SET img_rlusd_drops='999' WHERE purchase_tx=?").run('B'.repeat(64));
assert.throws(()=>contributionSnapshot(db,later),/capital_policy_split_conflict/);
db.close();
console.log('Future Estates: 3/15/3/75 XRP contributions, multiple buyers, historic owner, temporal cutoff, exact shares and no payout passed');
