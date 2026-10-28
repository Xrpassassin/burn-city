// Visual readout for IMM and XRPyro. A marker is never scaled by an unverified supply figure.
const IDENTITIES=Object.freeze({
 IMM:{issuer:'rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP',currency:'IMM'},
 XRPyro:{issuer:'rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va',currency:'XRPYRO'}
});
export function verifiedEcosystemSupplyFraction(record,name,now=Date.now()){
 const id=IDENTITIES[name];
 if(!id||!record||record.token!==name||record.status!=='verified'||
 record.method!=='verified_launch_vs_outstanding_v1'||record.issuer!==id.issuer||
 record.currency!==id.currency||!Number.isSafeInteger(record.ledger_index)||
 !/^[A-Fa-f0-9]{64}$/.test(record.ledger_hash||'')||
 !Number.isSafeInteger(record.launch_ledger)||record.launch_ledger>record.ledger_index||
 !/^[A-Fa-f0-9]{64}$/.test(record.issuance_hash||'')||
 !Number.isFinite(record.t_ms)||record.t_ms>now||now-record.t_ms>6*3600e3||
 typeof record.removed_pct!=='number'||!Number.isFinite(record.removed_pct)||
 record.removed_pct<0||record.removed_pct>100)return null;
 return record.removed_pct/100;
}
