'use strict';
// TREASURY_WATCH_AUTOPAUSE: default stays on (unknown outgoing txs pause payouts).
// When set to 0, the watchdog still logs and records them in watch_known.json but does not pause.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xrpl = require('xrpl');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bcwatch-'));
const T = xrpl.Wallet.generate().classicAddress;
Object.assign(process.env, { DATA_DIR: DIR, TREASURY_ADDRESS: T, DRY_RUN: 'true', BURN_JOB_IN_SERVER: 'false' });
delete process.env.TREASURY_WATCH_AUTOPAUSE;
delete process.env.PAYOUTS_PAUSED;

const C = require('./config');
const W = require('./watch');
const G = require('./guard');
const S = require('./store');

assert.equal(C.TREASURY_WATCH_AUTOPAUSE, true, 'default autopause stays on when env is unset');

function flagValue(env) {
  const script = 'console.log(JSON.stringify(require(' + JSON.stringify(path.join(__dirname, 'config.js')) + ').TREASURY_WATCH_AUTOPAUSE))';
  const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, DATA_DIR: DIR, TREASURY_ADDRESS: T, ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}
assert.equal(flagValue({ TREASURY_WATCH_AUTOPAUSE: '0' }), false);
assert.equal(flagValue({ TREASURY_WATCH_AUTOPAUSE: '1' }), true);
assert.equal(flagValue({ TREASURY_WATCH_AUTOPAUSE: '' }), true);

const XRPL_EPOCH = 946684800;
function outgoing(hash, ageMs = 300000) {
  return { validated: true, hash, tx_json: { Account: T, TransactionType: 'Payment', Destination: 'rNbR4Gw9d9JRLdkb4rAhkWDcJyKRk39FoA', Amount: '1000000', date: Math.floor((Date.now() - ageMs) / 1000) - XRPL_EPOCH } };
}
const ledger = (txs) => async () => ({ request: async () => ({ result: { transactions: txs } }) });

(async () => {
  const old = outgoing('OLD1', 600000);
  await W.tick(ledger([old]));
  assert.equal(G.paused(), false, 'baseline history does not pause');

  const thief = outgoing('THIEF');
  await W.tick(ledger([thief, old]));
  assert.equal(G.paused(), true, 'default: unknown outgoing tx pauses payouts');
  const pause = S.load('pause.json', {});
  assert.equal(pause.paused, true);
  assert.equal(pause.reason, 'unexpected_outgoing_tx');
  assert.ok(!S.load('watch_known.json', []).includes('THIEF'), 'paused hash is not auto-whitelisted');

  W.unpause();
  assert.equal(G.paused(), false);

  C.TREASURY_WATCH_AUTOPAUSE = false;
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); orig.apply(console, a); };
  try {
    const result = await W.tick(ledger([outgoing('MANUAL'), thief, old]));
    assert.ok((result.unknown || []).some((u) => u.hash === 'MANUAL'), 'still reports the unknown tx');
  } finally { console.error = orig; }
  assert.equal(G.paused(), false, 'autopause off: does not pause payouts or sales');
  assert.equal(S.load('pause.json', { paused: false }).paused, false, 'autopause off: does not write a pause');
  assert.ok(S.load('watch_known.json', []).includes('MANUAL'), 'autopause off: records hash in watch_known');
  assert.ok(errs.some((e) => /ALERT/i.test(e) && /MANUAL/.test(e) && /Autopause disabled/i.test(e)), 'autopause off: still logs loudly');

  const errs2 = [];
  console.error = (...a) => { errs2.push(a.map(String).join(' ')); orig.apply(console, a); };
  let result2;
  try { result2 = await W.tick(ledger([outgoing('MANUAL'), thief, old])); }
  finally { console.error = orig; }
  assert.deepEqual(result2.unknown || [], [], 'recorded hash is not reported again');
  assert.equal(G.paused(), false);
  assert.ok(!errs2.some((e) => /MANUAL/.test(e)), 'recorded hash is not re-logged');

  console.log('watch autopause tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
