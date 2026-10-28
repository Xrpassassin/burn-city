import assert from 'node:assert/strict';
import {verifiedSupplyFraction} from './verified-supply-visual.mjs';
import {supplyReconciliationCard} from './issuer-return-card.mjs';
const now=Date.now(),key='rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd-4255524E00000000000000000000000000000000';
const r={status:'verified',method:'fixed_issuance_supply_v1',token_key:key,issued:'1000000000000000',burned_pct:96.5156,outstanding:'34843983811577.57',ledger_index:107955066,ledger_hash:'A'.repeat(64),t_ms:now,evidence:{issuer_verified:true,launch_supply_verified:true,escrow_reconciled:true,no_excluded_wallets:true}};
assert.equal(verifiedSupplyFraction(r,key,now),.965156);
for(const mutate of [x=>x.status='unverified',x=>x.method='issuer_returns_v1',x=>x.token_key='other',x=>x.issued='1',x=>x.evidence.issuer_verified=false,x=>x.evidence.launch_supply_verified=false,x=>x.evidence.escrow_reconciled=false,x=>x.evidence.no_excluded_wallets=false,x=>x.t_ms=now+1,x=>x.t_ms=now-7*3600e3,x=>x.burned_pct=NaN,x=>x.burned_pct=101,x=>x.ledger_hash='z'.repeat(64),x=>x.ledger_index=1]){
 const copy=structuredClone(r);mutate(copy);assert.equal(verifiedSupplyFraction(copy,key,now),null);
}
assert.equal(verifiedSupplyFraction(r,'other',now),null);
const html=supplyReconciliationCard({record:r,tokenKey:key,tokenName:'<BURN>',now});
assert.match(html,/96.5156% net supply reduction/);assert.match(html,/&lt;BURN&gt;/);assert.match(html,/transfer-fee/);
assert.equal(supplyReconciliationCard({record:{...r,status:'unverified'},tokenKey:key,now}),null);
console.log('Verified supply visuals: proof, identity, freshness and card labels passed');
