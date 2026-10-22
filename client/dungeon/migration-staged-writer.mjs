/**
 * Staged writer prototype for an explicitly approved candidate save.
 * Storage and digest are injected; this module never accesses window/localStorage.
 * It is intentionally not wired to the game.
 */
const parseObject = (raw, label) => {
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error(label + ' is not valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be a JSON object.');
  return value;
};
const read = (storage, key) => storage.getItem(key);
const write = (storage, key, value) => storage.setItem(key, value);

export function commitCandidate({
  storage, sourceKey = 'egSave', attemptId, sourceRaw, sourceDigest,
  rulesetId, candidate, confirmed = false, digestText, validateCandidate,
  backupPrefix = 'egSaveMigrationBackup:', pendingPrefix = 'egSaveMigrationPending:',
  receiptPrefix = 'egSaveMigrationReceipt:'
}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('An injected storage adapter is required.');
  if (typeof digestText !== 'function' || typeof validateCandidate !== 'function') throw new TypeError('Digest and candidate validator functions are required.');
  if (confirmed !== true) throw new Error('Explicit player confirmation is required.');
  if (typeof attemptId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(attemptId)) throw new TypeError('A valid unique migration attempt ID is required.');
  if (typeof sourceRaw !== 'string' || typeof sourceDigest !== 'string' || !sourceDigest) throw new TypeError('A source snapshot and digest are required.');
  if (typeof rulesetId !== 'string' || !rulesetId.trim()) throw new TypeError('A migration ruleset ID is required.');

  const backupKey = backupPrefix + attemptId;
  const pendingKey = pendingPrefix + attemptId;
  const receiptKey = receiptPrefix + attemptId;
  const priorReceiptRaw = read(storage, receiptKey);
  if (priorReceiptRaw) {
    const prior = parseObject(priorReceiptRaw, 'Migration receipt');
    if (prior.status === 'committed' && prior.sourceDigest === sourceDigest && prior.rulesetId === rulesetId) {
      return { status: 'already-committed', attemptId, candidateDigest: prior.candidateDigest };
    }
    throw new Error('This migration attempt ID is already in use.');
  }

  const currentRaw = read(storage, sourceKey);
  const pendingRaw = read(storage, pendingKey);
  if (pendingRaw) {
    const pending = parseObject(pendingRaw, 'Pending migration');
    if (pending.attemptId !== attemptId || pending.sourceDigest !== sourceDigest || pending.rulesetId !== rulesetId) {
      throw new Error('A conflicting pending migration exists; preserve it for recovery and start no new attempt.');
    }
    if (currentRaw === pending.candidateRaw && digestText(currentRaw) === pending.candidateDigest) {
      const receipt = {
        status: 'committed', attemptId, sourceDigest, candidateDigest: pending.candidateDigest,
        rulesetId, recovery: 'completed-receipt-after-source-promotion'
      };
      write(storage, receiptKey, JSON.stringify(receipt));
      storage.removeItem?.(pendingKey);
      return { status: 'recovered-commit', attemptId, candidateDigest: pending.candidateDigest };
    }
    if (currentRaw !== sourceRaw || digestText(currentRaw) !== sourceDigest) {
      throw new Error('Active save no longer matches the preview. Do not overwrite it.');
    }
  } else if (currentRaw !== sourceRaw || digestText(currentRaw) !== sourceDigest) {
    throw new Error('Active save no longer matches the preview. Rebuild the preview before retrying.');
  }

  const source = parseObject(sourceRaw, 'Source save');
  validateCandidate(candidate);
  const candidateRaw = JSON.stringify(candidate);
  if (typeof candidateRaw !== 'string') throw new Error('Candidate could not be serialized.');
  const candidateDigest = digestText(candidateRaw);

  // Write the original snapshot before staging or replacing the active save.
  const existingBackup = read(storage, backupKey);
  const backup = JSON.stringify({ attemptId, sourceDigest, rulesetId, sourceRaw });
  if (existingBackup && existingBackup !== backup) throw new Error('Backup key already contains a different snapshot.');
  if (!existingBackup) write(storage, backupKey, backup);

  const pending = {
    status: 'prepared', attemptId, sourceDigest, candidateDigest, rulesetId,
    sourceVersion: source.v ?? null, candidateRaw
  };
  const pendingSerialized = JSON.stringify(pending);
  const existingPending = read(storage, pendingKey);
  if (existingPending && existingPending !== pendingSerialized) throw new Error('Pending key contains a different migration candidate.');
  if (!existingPending) write(storage, pendingKey, pendingSerialized);

  const staged = parseObject(read(storage, pendingKey), 'Staged migration');
  if (staged.candidateRaw !== candidateRaw || digestText(staged.candidateRaw) !== candidateDigest) {
    throw new Error('Staged candidate failed read-back verification; active save was not changed.');
  }
  validateCandidate(parseObject(staged.candidateRaw, 'Staged candidate'));

  // One key replacement is atomic in Web Storage. Keep backup/pending if anything fails.
  write(storage, sourceKey, candidateRaw);
  const promotedRaw = read(storage, sourceKey);
  if (promotedRaw !== candidateRaw || digestText(promotedRaw) !== candidateDigest) {
    throw new Error('Promoted save failed read-back verification. Keep backup and pending record for recovery.');
  }

  const receipt = { status: 'committed', attemptId, sourceDigest, candidateDigest, rulesetId, recovery: null };
  write(storage, receiptKey, JSON.stringify(receipt));
  storage.removeItem?.(pendingKey);
  return { status: 'committed', attemptId, candidateDigest, backupKey, receiptKey };
}
