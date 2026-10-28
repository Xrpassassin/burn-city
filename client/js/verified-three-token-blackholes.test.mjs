import assert from 'node:assert/strict';
import {verifiedBlackHoleVisual} from './verified-three-token-blackholes.mjs';
import {ecosystemSupplyCard} from './issuer-return-card.mjs';
const now=100000000;
for(const [name,issuer,currency] of [
 ['IMM','rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP','IMM'],
 ['XRPyro','rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va','XRPYRO']]) {
 const record={token:name,issuer,currency,status:'verified',method:'verified_launch_vs_outstanding_v1',
 ledger_index:107955066,launch_ledger:90000000,ledger_hash:'A'.repeat(64),issuance_hash:'B'.repeat(64),
 t_ms:now,removed_pct:64};
 const visual=verifiedBlackHoleVisual({name,record,rooftop:50,now});
 assert.equal(visual.verified,true);
 assert.equal(visual.fraction,.64);
 assert.ok(visual.altitude>50+visual.radius);
 assert.match(ecosystemSupplyCard({record,tokenName:name,now}),/64.0000% net supply reduction/);
 const pending=verifiedBlackHoleVisual({name,record:{...record,status:'unverified'},rooftop:50,now});
 assert.equal(pending.verified,false);assert.equal(pending.fraction,null);
 assert.equal(ecosystemSupplyCard({record:{...record,status:'unverified'},tokenName:name,now}),null);
}
const burnKey='rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd-4255524E00000000000000000000000000000000';
const burn={status:'verified',method:'fixed_issuance_supply_v1',token_key:burnKey,issued:'1000000000000000',burned_pct:96.5156,
ledger_index:107955066,ledger_hash:'C'.repeat(64),t_ms:now,
evidence:{issuer_verified:true,launch_supply_verified:true,escrow_reconciled:true,no_excluded_wallets:true}};
assert.equal(verifiedBlackHoleVisual({name:'BURN',tokenKey:burnKey,record:burn,now}).verified,true);
assert.equal(verifiedBlackHoleVisual({name:'BURN',tokenKey:burnKey,record:null,now}).verified,false);
console.log('All three verified visual descriptors and fail-closed cards passed');
