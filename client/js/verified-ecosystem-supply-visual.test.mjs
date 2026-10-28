import assert from 'node:assert/strict';
import {verifiedEcosystemSupplyFraction as fraction} from './verified-ecosystem-supply-visual.mjs';
const keys={IMM:['rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP','IMM'],XRPyro:['rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va','XRPYRO']};
for(const [name,[issuer,currency]] of Object.entries(keys)){
 const now=100000000;
 const record={token:name,issuer,currency,status:'verified',method:'verified_launch_vs_outstanding_v1',
 ledger_index:107955066,launch_ledger:90000000,ledger_hash:'A'.repeat(64),issuance_hash:'B'.repeat(64),t_ms:now-100,removed_pct:40};
 assert.equal(fraction(record,name,now),.4);
 assert.equal(fraction({...record,status:'unverified'},name,now),null);
 assert.equal(fraction({...record,issuer:'wrong'},name,now),null);
 assert.equal(fraction({...record,t_ms:now-7*3600e3},name,now),null);
 assert.equal(fraction({...record,removed_pct:101},name,now),null);
}
console.log('IMM and XRPyro visual verification passed');
