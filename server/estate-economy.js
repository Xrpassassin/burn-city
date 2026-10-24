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
  if (!totalWeight || !amount) return rows.map(r => ({ ...r, amountDrops: 0, totalWeight })).sort((a, b) => a.propertyId.localeCompare(b.propertyId));   // same order as the non-zero path
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

// Build a deterministic weekly accounting snapshot from reviewed, ledger-reconciled inputs.
// All monetary values are integer XRP drops. This function does not query XRPL or pay owners.
const crypto = require('node:crypto');
function weekStartUtc(value) {
  const s = String(value || '');
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) throw new TypeError('invalid_week_start');
  const d = new Date(s + 'T00:00:00.000Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== s || d.getUTCDay() !== 1) throw new TypeError('week_start_must_be_monday_utc');
  return s;
}
function safeDrops(value, field) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new TypeError(field + '_must_be_nonnegative_safe_integer');
  return n;
}
function buildWeeklySnapshot(input) {
  if (!input || typeof input !== 'object') throw new TypeError('snapshot_input_required');
  const weekStart = weekStartUtc(input.weekStart);
  const sourceWallet = String(input.sourceWallet || '').trim();
  const verificationRef = String(input.verificationRef || '').trim();
  const sourceLedgerIndex = Number(input.sourceLedgerIndex);
  if (!sourceWallet) throw new TypeError('source_wallet_required');
  if (!Number.isSafeInteger(sourceLedgerIndex) || sourceLedgerIndex < 1) throw new TypeError('source_ledger_index_required');
  if (!verificationRef) throw new TypeError('verification_ref_required');
  const realizedProfitDrops = safeDrops(input.realizedProfitDrops, 'realized_profit_drops');
  const feesDrops = safeDrops(input.feesDrops, 'fees_drops');
  const realizedLossesDrops = safeDrops(input.realizedLossesDrops, 'realized_losses_drops');
  const reserveDrops = safeDrops(input.reserveDrops, 'reserve_drops');
  const distributableDrops = Math.max(0, realizedProfitDrops - feesDrops - realizedLossesDrops - reserveDrops);
  const holdings = Array.isArray(input.holdings) ? input.holdings : (() => { throw new TypeError('holdings_must_be_array'); })();
  const allocations = [];
  const ownerMap = new Map();
  const seen = new Set();
  for (const h of holdings) {
    const propertyId = String(h?.propertyId || '');
    const acct = String(h?.acct || '');
    const weight = propertyWeight(propertyId);
    if (!weight || !acct) throw new TypeError('invalid_property_holding');
    if (seen.has(propertyId)) throw new TypeError('duplicate_property_holding');
    seen.add(propertyId);
    const row = ownerMap.get(acct) || { acct, propertyIds: [], weight: 0 };
    row.propertyIds.push(propertyId); row.weight += weight; ownerMap.set(acct, row);
  }
  const owners = [...ownerMap.values()].sort((a,b) => a.acct.localeCompare(b.acct));
  for (const owner of owners) owner.propertyIds.sort();
  const totalEligibleWeight = owners.reduce((sum, owner) => sum + owner.weight, 0);
  let assigned = 0;
  for (const owner of owners) {
    const numerator = BigInt(distributableDrops) * BigInt(owner.weight);
    owner.amountDrops = totalEligibleWeight ? Number(numerator / BigInt(totalEligibleWeight)) : 0;
    owner.remainder = totalEligibleWeight ? numerator % BigInt(totalEligibleWeight) : 0n;
    assigned += owner.amountDrops;
  }
  const ranked = [...owners].sort((a,b) => a.remainder === b.remainder ? a.acct.localeCompare(b.acct) : a.remainder > b.remainder ? -1 : 1);
  const leftover = distributableDrops - assigned;
  for (let i=0; i<leftover; i++) ranked[i].amountDrops++;
  const sortedHoldings = holdings.map(h => ({ propertyId:String(h.propertyId), acct:String(h.acct) })).sort((a,b) => a.propertyId.localeCompare(b.propertyId));
  const ownershipHash = crypto.createHash('sha256').update(JSON.stringify(sortedHoldings)).digest('hex');
  const finalAllocations = owners.map(({remainder,...owner}) => owner);
  if (finalAllocations.reduce((sum, owner) => sum + owner.amountDrops, 0) !== distributableDrops && totalEligibleWeight > 0) throw new Error('allocation_reconciliation_failed');
  return { weekStart, sourceWallet, sourceLedgerIndex, realizedProfitDrops, feesDrops, realizedLossesDrops, reserveDrops, distributableDrops, totalEligibleWeight, ownershipCount: sortedHoldings.length, ownershipHash, verificationRef, status:'draft', createdAt:Number(input.createdAt) > 0 ? Number(input.createdAt) : Date.now(), allocations:finalAllocations };
}

module.exports = { CATALOG, TIER_BY_ID, PROPERTY_BY_ID, propertyWeight, allocateProfit, buildWeeklySnapshot, weekStartUtc };
