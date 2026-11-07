// Only an exact, fresh on-ledger issuer-obligation record can size the
// XRPyro launch-minus-outstanding preview. It remains a *visual estimate*,
// not signed-off proof of all historical token burns or issuance.
const ISSUER = 'rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va';
const CURRENCY = '58525079726F0000000000000000000000000000';
const TOKEN_KEY = ISSUER + '-' + CURRENCY;
const STALE_MS = 6 * 3600e3;

export function xrpyroLedgerOutstanding({name,tokenKey,record,now=Date.now()} = {}) {
  if (name !== 'XRPyro' || tokenKey !== TOKEN_KEY || !record ||
      record.issuer !== ISSUER || record.currency !== CURRENCY ||
      record.status !== 'verified' || record.issuer_keys_disabled !== true ||
      record.supply_src !== 'gateway_balances(' + ISSUER + ').obligations' ||
      typeof record.supply !== 'number' || !Number.isFinite(record.supply) ||
      record.supply < 0 || record.supply > 1 ||
      !Number.isFinite(record.t_ms) || !Number.isFinite(now) ||
      record.t_ms > now || now - record.t_ms > STALE_MS) return null;
  return record.supply;
}
