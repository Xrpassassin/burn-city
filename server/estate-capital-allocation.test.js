'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {createEstateCapitalAllocation,splitEstateCapital}=require('./estate-capital-allocation');
const {createEstateSaleReservations}=require('./estate-sale-reservations');
const {createEstateSaleSettlementStore}=require('./estate-sale-settlement');
const owner='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,purchase_tx TEXT NOT NULL UNIQUE,purchase_amount_drops INTEGER NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL)');
const capital=createEstateCapitalAllocation(db),reservations=createEstateSaleReservations(db),settlements=createEstateSaleSettlementStore(db);
assert.deepEqual(splitEstateCapital('3000000'),{purchaseDrops:'3000000',imgPlxDrops:'0',imgXrpDrops:'0',imgRlusdDrops:'2970000',operatingReserveDrops:'30000'});
assert.equal(splitEstateCapital('1').operatingReserveDrops,'1');
const huge=splitEstateCapital('900719925474099300000001');assert.equal(BigInt(huge.imgRlusdDrops)+BigInt(huge.operatingReserveDrops),BigInt(huge.purchaseDrops));
for(const bad of [0,3,'0','-1','1.1','01','1e6'])assert.throws(()=>splitEstateCapital(bad));
assert.throws(()=>capital.record({purchase_tx:'A'.repeat(64)}),/settled_purchase_required/);
function input(id,property,hash){const r=reservations.reserve({reservationId:id,propertyId:property,buyer:owner,now:1000000});return {reservationId:id,now:1000001,verification:{reservationId:id,propertyId:property,buyer:owner,amountDrops:r.price_drops,txHash:hash,ledgerIndex:99,validated:true,settlementVerified:true,ownershipAssigned:false,distributable:false}};}
const a=input('reservation-00000001','trailer-01','A'.repeat(64));
settlements.settle(a);settlements.settle(a);
let state=capital.state(owner);assert.equal(state.capitalAllocations.length,1);assert.equal(state.capitalAllocationPolicy.automaticDepositsEnabled,false);
assert.equal(state.capitalAllocations[0].img_plx_drops,'0');assert.equal(state.capitalAllocations[0].img_rlusd_drops,'2970000');
assert.equal(capital.reservedDrops(),'2970000');assert.equal(capital.state('another-wallet').capitalAllocations.length,0);
assert.equal(createEstateCapitalAllocation(db).reservedDrops(),'2970000');
// A failure to reserve principal must roll ownership and reservation back too.
const b=input('reservation-00000002','trailer-02','B'.repeat(64));
db.exec("CREATE TRIGGER deny_capital BEFORE INSERT ON estate_capital_allocations BEGIN SELECT RAISE(ABORT,'capital_disk_failure'); END;");
assert.throws(()=>settlements.settle(b),/capital_disk_failure/);
assert.equal(db.prepare('SELECT 1 FROM estate_property_ownership WHERE property_id=?').get('trailer-02'),undefined);
assert.equal(reservations.get(b.reservationId).status,'reserved');
assert.equal(capital.reservedDrops(),'2970000');
console.log('Estates capital: versioned IMG/RLUSD routing, atomic settlement, restart/replay, privacy and failed-write rollback passed');
