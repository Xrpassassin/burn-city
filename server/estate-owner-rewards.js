'use strict';

const { propertyWeight } = require('./estate-economy');

// Combined-owner model: all eligible properties belonging to one XRPL account
// are combined before profit is allocated. Uses integer drops and largest remainder.
function allocateOwnerProfit(distributableDrops, holdings) {
  const amount = Number(distributableDrops);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new TypeError('distributable_drops_must_be_nonnegative_safe_integer');
  }
  if (!Array.isArray(holdings)) throw new TypeError('holdings_must_be_array');

  const properties = new Set();
  const owners = new Map();
  for (const holding of holdings) {
    const propertyId = String(holding?.propertyId || '');
    const acct = String(holding?.acct || '');
    const weight = propertyWeight(propertyId);
    if (!weight || !acct) throw new TypeError('invalid_property_holding');
    if (properties.has(propertyId)) throw new TypeError('duplicate_property_holding');
    properties.add(propertyId);
    const row = owners.get(acct) || { acct, propertyIds: [], weight: 0 };
    row.propertyIds.push(propertyId);
    row.weight += weight;
    owners.set(acct, row);
  }

  const rows = [...owners.values()].map(row => ({
    ...row,
    propertyIds: row.propertyIds.sort(),
    remainder: 0n,
    amountDrops: 0
  })).sort((a, b) => a.acct.localeCompare(b.acct));
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!amount || !totalWeight) {
    return rows.map(({ remainder, ...row }) => ({ ...row, totalWeight }));
  }

  const amountBig = BigInt(amount);
  const totalBig = BigInt(totalWeight);
  let assigned = 0n;
  for (const row of rows) {
    const numerator = amountBig * BigInt(row.weight);
    row.amountDrops = Number(numerator / totalBig);
    row.remainder = numerator % totalBig;
    assigned += numerator / totalBig;
  }
  rows.sort((a, b) => a.remainder === b.remainder
    ? a.acct.localeCompare(b.acct)
    : a.remainder > b.remainder ? -1 : 1);
  const leftover = Number(amountBig - assigned);
  for (let i = 0; i < leftover; i++) rows[i].amountDrops++;
  return rows.map(({ remainder, ...row }) => ({ ...row, totalWeight }))
    .sort((a, b) => a.acct.localeCompare(b.acct));
}

module.exports = { allocateOwnerProfit };
