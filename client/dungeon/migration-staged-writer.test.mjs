import assert from 'node:assert/strict';
import { commitCandidate } from './migration-staged-writer.mjs';

const digestText = text => {
  // Stable deterministic stand-in for unit tests; production should inject SHA-256.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
};
class MemoryStorage {
  data = new Map();
  failOn = null;
  writes = 0;
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k,v) {
    this.writes++;
    if (this.failOn === this.writes) throw new Error('simulated storage failure');
    this.data.set(k,String(v));
  }
  removeItem(k) { this.data.delete(k); }
}
const source = { v: 2, name: 'Ashwalker', lvl: 5, xp: 12 };
const sourceRaw = JSON.stringify(source);
const sourceDigest = digestText(sourceRaw);
const candidate = { v: 3, name: 'Ashwalker', classId: 'arcanist', lvl: 5, xp: 12 };
const validateCandidate = x => {
  if (!x || x.v !== 3 || typeof x.classId !== 'string') throw new Error('candidate schema invalid');
};
const args = storage => ({ storage, sourceRaw, sourceDigest, rulesetId: 'test-rules-v1',
  attemptId: 'attempt_12345678', candidate, confirmed: true, digestText, validateCandidate });

{
  const storage = new MemoryStorage(); storage.setItem('egSave', sourceRaw);
  const result = commitCandidate(args(storage));
  assert.equal(result.status, 'committed');
  assert.equal(storage.getItem('egSave'), JSON.stringify(candidate));
  assert.ok(storage.getItem(result.backupKey));
  assert.ok(storage.getItem(result.receiptKey));
  assert.equal(storage.getItem('egSaveMigrationPending:attempt_12345678'), null);
  assert.equal(commitCandidate(args(storage)).status, 'already-committed');
  storage.setItem('egSave', JSON.stringify({ ...candidate, xp: 100 }));
  assert.throws(() => commitCandidate(args(storage)), /active save no longer matches it/);
}
{
  const storage = new MemoryStorage(); storage.setItem('egSave', sourceRaw);
  assert.throws(() => commitCandidate({ ...args(storage), confirmed: false }), /confirmation/);
  assert.equal(storage.getItem('egSave'), sourceRaw);
}
{
  const storage = new MemoryStorage(); storage.setItem('egSave', sourceRaw);
  assert.throws(() => commitCandidate({ ...args(storage), sourceDigest: 'wrong-digest' }), /does not match/);
  assert.equal(storage.getItem('egSave'), sourceRaw);
}
{
  const storage = new MemoryStorage(); storage.setItem('egSave', JSON.stringify({ ...source, xp: 99 }));
  assert.throws(() => commitCandidate(args(storage)), /no longer matches/);
}
{
  const storage = new MemoryStorage(); storage.setItem('egSave', sourceRaw);
  assert.throws(() => commitCandidate({ ...args(storage), candidate: { ...candidate, v: 2 } }), /candidate schema invalid/);
  assert.equal(storage.getItem('egSave'), sourceRaw);
}
{
  const storage = new MemoryStorage(); storage.setItem('egSave', sourceRaw);
  // Fail the backup write. Active save must remain unchanged.
  storage.failOn = storage.writes + 1;
  assert.throws(() => commitCandidate(args(storage)), /simulated storage failure/);
  assert.equal(storage.getItem('egSave'), sourceRaw);
}
{
  const storage = new MemoryStorage(); storage.setItem('egSave', sourceRaw);
  // Mutate the active save after staging; the last-moment guard must refuse promotion.
  const originalSet = storage.setItem.bind(storage);
  let changedDuringStage = false;
  storage.setItem = (k,v) => {
    originalSet(k,v);
    if (k === 'egSaveMigrationPending:attempt_12345678' && !changedDuringStage) {
      changedDuringStage = true;
      originalSet('egSave', JSON.stringify({ ...source, xp: 99 }));
    }
  };
  assert.throws(() => commitCandidate(args(storage)), /changed during staging/);
  assert.equal(storage.getItem('egSave'), JSON.stringify({ ...source, xp: 99 }));
  assert.ok(storage.getItem('egSaveMigrationBackup:attempt_12345678'));
  assert.ok(storage.getItem('egSaveMigrationPending:attempt_12345678'));
}
{
  const storage = new MemoryStorage(); storage.setItem('egSave', sourceRaw);
  // Simulate a crash after active-save promotion but before receipt write.
  const originalSet = storage.setItem.bind(storage);
  let failReceipt = true;
  storage.setItem = (k,v) => {
    if (k === 'egSaveMigrationReceipt:attempt_12345678' && failReceipt) {
      failReceipt = false; throw new Error('simulated receipt failure');
    }
    return originalSet(k,v);
  };
  assert.throws(() => commitCandidate(args(storage)), /receipt failure/);
  assert.equal(storage.getItem('egSave'), JSON.stringify(candidate));
  assert.ok(storage.getItem('egSaveMigrationPending:attempt_12345678'));
  assert.equal(commitCandidate(args(storage)).status, 'recovered-commit');
  assert.ok(storage.getItem('egSaveMigrationReceipt:attempt_12345678'));
}
console.log('Staged migration writer tests passed.');
