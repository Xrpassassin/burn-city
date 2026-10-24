'use strict';
const fs = require('node:fs');
const path = require('node:path');
const CATALOG_PATH = path.join(__dirname, '..', 'client', 'data', 'estate-catalog.json');
const CATALOG = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const TIER_BY_ID = new Map(CATALOG.tiers.map(t => [t.id, t]));
const PROPERTY_BY_ID = new Map(CATALOG.properties.map(p => [p.id, p]));
function propertyWeight(propertyId) {
  const property = PROPERTY_BY_ID.get(String(propertyId));
  return property ? (TIER_BY_ID.get(property.tier)?.shareUnits || 0) : 0;
}
// Allocate integer drops proportionally by owned property's relative share units.
// Largest-remainder allocation ensures every distributable drop is assigned exactly once.
function allocateProfit(distributableDrops, holdings) {
  const amount = Number(distributableDrops);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError('distributable_drops_must_be_nonnegative_safe_integer');
  if (!Array.isArray(holdings)) throw new TypeError('holdings_must_be_array');
  const rows = holdings.map(h => {
    const propertyId = String(h.propertyId || '');
    const weight = propertyWeight(propertyId);
    const acct = String(h.acct || '');
    if (!weight || !acct) throw new TypeError('invalid_property_holding');
    return { propertyId, acct, weight };
  });
  if (new Set(rows.map(r => r.propertyId)).size !== rows.length) throw new TypeError('duplicate_property_holding');
  const totalWeight = rows.reduce((n, r) => n + r.weight, 0);
  if (!totalWeight || !amount) return rows.map(r => ({ ...r, amountDrops: 0, totalWeight }));
  const amountBig = BigInt(amount), totalWeightBig = BigInt(totalWeight);
  let assigned = 0n;
  const out = rows.map(r => {
    const numerator = amountBig * BigInt(r.weight), base = numerator / totalWeightBig, remainder = numerator % totalWeightBig;
    assigned += base;
    return { ...r, amountDrops: Number(base), remainder, totalWeight };
  });
  out.sort((a, b) => (a.remainder === b.remainder ? a.propertyId.localeCompare(b.propertyId) : a.remainder > b.remainder ? -1 : 1));
  const leftover = Number(amountBig - assigned);
  for (let i = 0; i < leftover; i++) out[i].amountDrops++;
  return out.map(({ remainder, ...r }) => r).sort((a, b) => a.propertyId.localeCompare(b.propertyId));
}
module.exports = { CATALOG, TIER_BY_ID, PROPERTY_BY_ID, propertyWeight, allocateProfit };
