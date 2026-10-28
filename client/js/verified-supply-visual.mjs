const BURN_KEY='rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd-4255524E00000000000000000000000000000000';
// Separate from enumerated issuer-return history: this is net supply reduction.
export function verifiedSupplyFraction(r,key,now=Date.now()) {
 if(key!==BURN_KEY||r?.token_key!==key||r.status!=='verified'||r.method!=='fixed_issuance_supply_v1'||
  r.issued!=='1000000000000000'||r.evidence?.issuer_verified!==true||r.evidence?.launch_supply_verified!==true||
  r.evidence?.escrow_reconciled!==true||r.evidence?.no_excluded_wallets!==true||
  !Number.isSafeInteger(r.ledger_index)||r.ledger_index<92601106||!/^[A-Fa-f0-9]{64}$/.test(r.ledger_hash||'')||
  !Number.isFinite(r.t_ms)||r.t_ms>now||now-r.t_ms>6*3600e3||
  typeof r.burned_pct!=='number'||!Number.isFinite(r.burned_pct)||r.burned_pct<0||r.burned_pct>100)return null;
 return r.burned_pct/100;
}
