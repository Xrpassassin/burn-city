'use strict';
// Pure accounting only. No custody, signing, transfers, or network access.
const { propertyWeight } = require('./estate-economy');
const XRPL_ADDRESS = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
function units(value, label) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError(`${label} must be a decimal integer string`);
  return BigInt(value);
}
function allocateEpoch({ epochId, currency, distributableUnits, holdings } = {}) {
  if (typeof epochId !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(epochId) || !Number.isFinite(Date.parse(epochId)) || new Date(epochId).toISOString().replace('.000Z','Z') !== epochId) throw new TypeError('invalid UTC hourly epoch');
  if (!['IMG', 'XRP'].includes(currency)) throw new TypeError('unsupported currency');
  const amount = units(distributableUnits, 'distributableUnits');
  if (!Array.isArray(holdings)) throw new TypeError('holdings required');
  const owners = new Map(), seen = new Set();
  for (const h of holdings) {
    if (!h || typeof h.propertyId !== 'string' || seen.has(h.propertyId)) throw new TypeError('invalid or duplicate property');
    seen.add(h.propertyId);
    const weight = propertyWeight(h.propertyId);
    if (!Number.isSafeInteger(weight) || weight <= 0) throw new TypeError('unknown property');
    if (typeof h.acct !== 'string' || !XRPL_ADDRESS.test(h.acct)) throw new TypeError('invalid owner wallet');
    owners.set(h.acct, (owners.get(h.acct) || 0n) + BigInt(weight));
  }
  const rows = [...owners].sort(([a], [b]) => a.localeCompare(b));
  const totalWeight = rows.reduce((s, [, w]) => s + w, 0n);
  if (!totalWeight) return Object.freeze({ epochId, currency, allocations: [], remainderUnits: amount.toString(), totalWeight: '0' });
  const allocations = rows.map(([wallet, weight]) => ({ wallet, shares: weight.toString(), units: (amount * weight / totalWeight).toString() }));
  const allocated = allocations.reduce((s, a) => s + BigInt(a.units), 0n);
  return Object.freeze({ epochId, currency, allocations: allocations.map(Object.freeze), remainderUnits: (amount - allocated).toString(), totalWeight: totalWeight.toString() });
}
module.exports = { allocateEpoch };
