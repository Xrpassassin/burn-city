'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateCapitalAllocation}=require('./estate-capital-allocation');
const {createLegacyEstateReviewJournal}=require('./estate-legacy-v2-review');
const tx='A'.repeat(64),wallet='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_property_ownership(
 property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,
 purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER
);
CREATE TABLE estate_liquidity_jobs(
 id TEXT PRIMARY KEY,purchase_tx TEXT,pair TEXT,initial_budget_drops TEXT,
 state TEXT,data_json TEXT,note TEXT
);
CREATE TABLE estate_payout_credits(owner TEXT PRIMARY KEY,units TEXT);
INSERT INTO estate_payout_credits VALUES('${wallet}','1000000');
`);
db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)')
 .run('trailer-01',wallet,tx,3000000,1,1700000000);
createEstateCapitalAllocation(db,{policyVersion:1})
 .record(db.prepare('SELECT * FROM estate_property_ownership').get());
const add=db.prepare('INSERT INTO estate_liquidity_jobs(id,purchase_tx,pair,initial_budget_drops,state,data_json) VALUES(?,?,?,?,?,?)');
add.run('old-plx',tx,'img-plx','2100000','invested',
 JSON.stringify({basis:'2038880',cash:'32448',lp:'1940.67982383456',
  lpAccount:'rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ',
  lpCurrency:'033956A65724AFF248F7E276BC1F4E1FEAF0E675'}));
add.run('old-imgxrp',tx,'img-xrp','900000','invested',
 JSON.stringify({basis:'869056',cash:'30968',lp:'11157.61391981',
  lpAccount:'rBcRRghoEuyvkUwL3DVaEJrcmPHf8DkTc6',
  lpCurrency:'03169AE84CCDEF4E3D0C33574F387117F6077973'}));
const originalPolicy=createEstateCapitalAllocation(db,{policyVersion:1}).state(wallet);
assert.equal(originalPolicy.capitalAllocations.length,1);
assert.equal(originalPolicy.capitalAllocations[0].fundingState,'legacy_retired_review');
assert.match(originalPolicy.capitalAllocations[0].pool,/Retired historical allocation/);
const store=createLegacyEstateReviewJournal(db);
const draft=store.preview(tx);
assert.equal(draft.purchaseDrops,'3000000');
assert.equal(draft.oldPlxBudgetDrops,'2100000');
assert.equal(draft.oldImgXrpBudgetDrops,'900000');
assert.equal(draft.proposedImgRlusdDrops,'2970000');
assert.equal(draft.proposedXrpReserveDrops,'30000');
assert.equal(draft.positions.length,2);
assert.equal(draft.positions[0].recordedBasisDrops,'2038880');
assert.equal(draft.actualReplacementAssetsVerified,false);
assert.equal(draft.assetsTransferred,false);
assert.equal(draft.treasuryPauseClearanceAuthorized,false);
assert.equal(store.read(tx),null);
const staged=store.stageUnverifiedReview({purchaseTx:tx,
 reviewerNote:'Operator must verify historic custody and replacement asset ownership before approval.',
 nowMs:1700000000000});
assert.equal(staged.state,'unverified_proposal');
assert.equal(staged.noFundsMoved,true);
assert.equal(staged.financialActivationAuthorized,false);
assert.equal(store.read(tx).proposal_sha256,staged.proposalDigest);
assert.equal(store.read(tx).state,'unverified_proposal');
assert.throws(()=>store.stageUnverifiedReview({purchaseTx:tx,
 reviewerNote:'Duplicate entry is forbidden'}),/duplicate_legacy_review/);
assert.throws(()=>db.exec("UPDATE estate_legacy_v2_review_proposals SET state='approved'"),/immutable_legacy_review/);
assert.throws(()=>db.exec("DELETE FROM estate_legacy_v2_review_proposals"),/immutable_legacy_review/);
assert.equal(createLegacyEstateReviewJournal(db).read(tx).proposal_sha256,staged.proposalDigest);
assert.equal(db.prepare('SELECT policy_version FROM estate_capital_allocations').get().policy_version,1);
assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_liquidity_jobs').get().n,2);
assert.equal(db.prepare('SELECT units FROM estate_payout_credits').get().units,'1000000');
assert.throws(()=>store.preview('B'.repeat(64)),/verified_legacy_purchase_record_required/);
assert.throws(()=>store.stageUnverifiedReview({purchaseTx:tx,reviewerNote:'no'}),/operator_review_note_required/);
db.prepare("UPDATE estate_liquidity_jobs SET state='withdraw' WHERE id='old-plx'").run();
assert.throws(()=>store.preview(tx),/historical_position_state_or_budget_mismatch/);
db.close();
console.log('Estates legacy 3 XRP: immutable proposal, zero fund movement, legacy books and payouts preserved');
