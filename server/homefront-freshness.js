'use strict';

// Deterministic per-batch freshness rules for Homefront food supplies.
// This module deliberately does not delete spoiled stock; callers decide how
// the UI and consumption rules present or handle it.
const FOOD = Object.freeze({
  rawFood: { label: 'Raw food', shelfLifeMs: 4 * 60 * 60 * 1000 },
  food: { label: 'Cooked ration', shelfLifeMs: 24 * 60 * 60 * 1000 }
});
const MAX_BATCHES_PER_ITEM = 64;
const clampInt = (n, min, max) => Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
function validBatch(batch) {
  return batch && typeof batch === 'object' && Number.isFinite(batch.qty) && batch.qty > 0 &&
    Number.isFinite(batch.acquiredAt) && batch.acquiredAt >= 0;
}
function normalizeBatches(input, counts = {}, migratedAt = Date.now()) {
  const out = {};
  for (const [id] of Object.entries(FOOD)) {
    const count = clampInt(counts[id], 0, 999999);
    const supplied = Array.isArray(input?.[id]) ? input[id].filter(validBatch).slice(0, MAX_BATCHES_PER_ITEM)
      .map(b => ({ qty: clampInt(b.qty, 1, 999999), acquiredAt: clampInt(b.acquiredAt, 0, Number.MAX_SAFE_INTEGER) }))
      .sort((a, b) => a.acquiredAt - b.acquiredAt) : [];
    const batches = [];
    let remaining = count;
    for (const batch of supplied) {
      if (remaining <= 0) break;
      const qty = Math.min(remaining, batch.qty);
      if (qty) batches.push({ qty, acquiredAt: batch.acquiredAt });
      remaining -= qty;
    }
    // Legacy integer-only saves migrate once. The caller must persist this
    // result; subsequent normalization retains the original timestamp.
    if (remaining > 0) batches.push({ qty: remaining, acquiredAt: clampInt(migratedAt, 0, Number.MAX_SAFE_INTEGER) });
    out[id] = batches;
  }
  return out;
}
function addBatch(input, id, qty = 1, now = Date.now()) {
  if (!FOOD[id]) throw new Error('not_perishable_' + id);
  const batches = normalizeBatches(input, Object.fromEntries(Object.entries(FOOD).map(([key]) => [key, (input?.[key] || []).reduce((n, b) => n + (validBatch(b) ? b.qty : 0), 0)])), now);
  const amount = clampInt(qty, 1, 999999);
  if (amount) batches[id].push({ qty: amount, acquiredAt: clampInt(now, 0, Number.MAX_SAFE_INTEGER) });
  batches[id].sort((a, b) => a.acquiredAt - b.acquiredAt);
  return batches;
}
function takeBatches(input, id, qty, counts, migratedAt = Date.now()) {
  if (!FOOD[id]) throw new Error('not_perishable_' + id);
  const batches = normalizeBatches(input, counts, migratedAt);
  let remaining = clampInt(qty, 1, 999999);
  const taken = [];
  for (const batch of batches[id]) {
    if (!remaining) break;
    const amount = Math.min(remaining, batch.qty);
    if (amount) taken.push({ qty: amount, acquiredAt: batch.acquiredAt });
    batch.qty -= amount;
    remaining -= amount;
  }
  if (remaining) throw new Error('not_carrying_' + id);
  batches[id] = batches[id].filter(b => b.qty > 0);
  return { batches, taken };
}
function describeBatch(id, batch, now = Date.now()) {
  const spec = FOOD[id];
  if (!spec || !validBatch(batch)) throw new Error('invalid_food_batch');
  const ageMs = Math.max(0, now - batch.acquiredAt);
  const remainingMs = Math.max(0, spec.shelfLifeMs - ageMs);
  const freshness = ageMs >= spec.shelfLifeMs ? 'spoiled' : ageMs >= spec.shelfLifeMs * 0.5 ? 'aging' : 'fresh';
  return { id, qty: clampInt(batch.qty, 1, 999999), acquiredAt: batch.acquiredAt, ageMs, remainingMs, freshness };
}
function summarize(input, counts = {}, now = Date.now(), migratedAt = now) {
  const batches = normalizeBatches(input, counts, migratedAt);
  const out = {};
  for (const id of Object.keys(FOOD)) {
    const details = batches[id].map(batch => describeBatch(id, batch, now));
    out[id] = {
      count: details.reduce((n, b) => n + b.qty, 0),
      fresh: details.filter(b => b.freshness === 'fresh').reduce((n, b) => n + b.qty, 0),
      aging: details.filter(b => b.freshness === 'aging').reduce((n, b) => n + b.qty, 0),
      spoiled: details.filter(b => b.freshness === 'spoiled').reduce((n, b) => n + b.qty, 0),
      batches: details
    };
  }
  return out;
}
module.exports = { FOOD, normalizeBatches, addBatch, takeBatches, describeBatch, summarize };
