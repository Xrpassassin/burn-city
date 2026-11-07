// IMM black-hole preview eligibility. The launch baseline is a project-owner
// figure; the current outstanding balance is ledger-backed, but the difference
// is only an estimate until the launch issuance is independently established.
const ISSUER='rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP';
const CURRENCY='IMM';
const TOKEN_KEY=ISSUER+'-'+CURRENCY;
const LAUNCH_SUPPLY=888888888888888;
const STALE_MS=6*3600e3;
export function immLedgerOutstanding({name,tokenKey,record,now=Date.now()}={}){
 if(name!=='IMM'||tokenKey!==TOKEN_KEY||!record||
    record.issuer!==ISSUER||record.currency!==CURRENCY||
    record.status!=='verified'||record.issuer_keys_disabled!==true||
    record.supply_src!=='gateway_balances('+ISSUER+').obligations'||
    typeof record.supply!=='number'||!Number.isFinite(record.supply)||
    record.supply<0||record.supply>LAUNCH_SUPPLY||
    !Number.isFinite(record.t_ms)||!Number.isFinite(now)||
    record.t_ms>now||now-record.t_ms>STALE_MS)return null;
 return record.supply;
}
