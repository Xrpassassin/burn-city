'use strict';
// Read-only, fail-closed snapshot accounting for IMM and XRPyro.
// The verified initial issuance is supplied by a separately reviewed, pinned launch ledger record.
// A market-data supply number must never be substituted for this evidence.
const { decimalUnits } = require('./issuer-return-history');
const goldlock = require('../client/js/goldlock.js');
function issuerIsBlackholed(info) { return !!info?.account_data && !info.account_data.AMMID && goldlock.isBlackholedInfo(info); }
const TOKENS = Object.freeze({
 IMM: {issuer:'rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP',currency:'IMM'},
 XRPyro: {issuer:'rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va',currency:'XRPYRO'}
});
function units(s) {
 if (typeof s !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) throw Error('invalid unsigned XRPL amount');
 const p=decimalUnits(s); if(!p || p.units<0n) throw Error('unrepresentable XRPL amount');
 return p.units;
}
function reconcile({name,launch,issuerInfo,gateway,now=Date.now()}={}) {
 const fail=reason=>({status:'unverified',method:'verified_launch_vs_outstanding_v1',token:name,removed_pct:null,reason});
 try {
  const t=TOKENS[name];if(!t)return fail('unsupported token');
  if(!launch || launch.status!=='verified' || launch.issuer!==t.issuer || launch.currency!==t.currency ||
    !/^[A-Fa-f0-9]{64}$/.test(launch.issuance_hash||'') ||
    !Number.isSafeInteger(launch.launch_ledger) || launch.launch_ledger<=0 ||
    typeof launch.initial_supply!=='string')return fail('pinned verified initial issuance required');
  const initial=units(launch.initial_supply);if(initial<=0n)return fail('initial supply must be positive');
  const a=issuerInfo?.result||issuerInfo,g=gateway?.result||gateway;
  const i=a?.ledger_index,h=a?.ledger_hash;
  if(a?.validated!==true||g?.validated!==true||!Number.isSafeInteger(i)||
    !/^[A-Fa-f0-9]{64}$/.test(h||'')||g.ledger_index!==i||g.ledger_hash!==h||g.account!==t.issuer)
    return fail('issuer and gateway require same validated ledger hash');
  if(!issuerIsBlackholed(a))return fail('issuer not verified permanently inaccessible');
  // gateway_balances excludes frozen and escrowed funds from obligations.
  if(Object.keys(g.balances||{}).length||Object.keys(g.assets||{}).length)
    return fail('unexpected gateway exclusions require review');
  const obligations=units(g.obligations?.[t.currency]??'0');
  let frozen=0n;
  for(const arr of Object.values(g.frozen_balances||{}))
    for(const entry of arr)if(entry.currency===t.currency)frozen+=units(String(entry.value));
  // Exclude escrow from the removed amount, even if it is temporarily non-circulating.
  // Require explicit independently reconciled escrow evidence rather than treating absent as zero.
  if(!launch.escrow_evidence || launch.escrow_evidence.ledger_index!==i ||
    launch.escrow_evidence.ledger_hash!==h ||
    launch.escrow_evidence.verified!==true)return fail('pinned complete escrow reconciliation required');
  const escrow=units(launch.escrow_evidence.amount);
  if(escrow!==units(g.locked?.[t.currency]??'0'))return fail('escrow and gateway locked totals differ');
  const outstanding=obligations+frozen+escrow;
  if(outstanding>initial)return fail('outstanding exceeds launch supply; subsequent issuance or baseline mismatch');
  if(!Number.isFinite(now)||now<=0)return fail('invalid verification time');
  const removed=initial-outstanding;
  const pct=Number(removed*1000000n/initial)/10000;
  return {status:'verified',method:'verified_launch_vs_outstanding_v1',token:name,issuer:t.issuer,currency:t.currency,
   initial_supply:launch.initial_supply,removed_pct:pct,
   outstanding_units:outstanding.toString(),removed_units:removed.toString(),
   ledger_index:i,ledger_hash:h,launch_ledger:launch.launch_ledger,
   issuance_hash:launch.issuance_hash,t_ms:now,
   scope:'Net issued-token supply reduction, including issuer returns and transfer fees; not proof of individual burn transactions.'};
 }catch(e){return fail(e.message||'invalid supply evidence');}
}
module.exports={TOKENS,reconcile};
