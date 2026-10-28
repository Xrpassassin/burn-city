import assert from 'node:assert/strict';
import { issuerReturnCard } from './issuer-return-card.mjs';
const now = 100000000, tokenKey = 'issuer-currency';
const record = { status: 'verified', method: 'issuer_returns_v1', token_key: tokenKey,
  burned: '250', burned_pct: 25, t_ms: now,
  coverage: { complete: true, from_ledger: 1, to_ledger: 100 },
  evidence: { issuer_verified: true, launch_supply_verified: true, rejected_records: 0 } };
const card = (r, extra = {}) => issuerReturnCard({ record: r, tokenKey, tokenName: '<BURN>', now, ...extra });
const verified = card(record);
assert.match(verified, /25.00% of launch circulating supply/);
assert.match(verified, /250 &lt;BURN&gt; returned to the issuer/);
assert.match(verified, /Validated ledgers 1–100/);
assert.doesNotMatch(verified, /have not been verified/);
for (const r of [null, { ...record, t_ms: now - 21600001 },
  { ...record, token_key: 'wrong' }, { ...record, status: 'unverified' },
  { ...record, evidence: { ...record.evidence, launch_supply_verified: false } }]) {
  assert.match(card(r), /have not been verified together/);
  assert.doesNotMatch(card(r), /25.00%|250/);
}
assert.match(card(null, { issuerVerified: true }), /Verified inaccessible issuer/);
assert.match(card({ ...record, burned_pct: 0, burned: '0' }), /0.00%/);
assert.match(card({ ...record, burned: '<script>' }), /&lt;script&gt;/);
console.log('issuer-return-card: all tests passed');
