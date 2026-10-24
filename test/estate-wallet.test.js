'use strict';
const assert = require('node:assert/strict');
const { createEstateWallet } = require('../server/estate-wallet');

const address = 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
let clock = 1_800_000_000_000;
let signedAccount = address;
let signInResult = { ok: true, account: address };
const config = { ESTATE_TREASURY: address, XUMM_KEY: 'test-key', XUMM_SECRET: 'test-secret', NETWORK: 'mainnet' };
const pay = {
  async startSignIn() { return { sid: 'SI-test', xaman: { uuid: 'uuid-test', deeplink: 'https://example.invalid/payload' } }; },
  async finishSignIn(id) { assert.equal(id, 'SI-test'); return { ...signInResult, account: signedAccount }; }
};
const wallet = createEstateWallet({ config, pay, now: () => clock });

(async () => {
  assert.equal(wallet.status().ownerControlVerified, false);
  assert.equal(wallet.status().salesEnabled, false);
  const start = await wallet.startVerification();
  assert.equal(start.ok, true);
  assert.equal(start.verificationId, 'SI-test');

  const pending = await wallet.finishVerification('SI-test');
  assert.equal(pending.ok, true);
  assert.equal(wallet.status().ownerControlVerified, true);
  assert.equal(wallet.status().salesEnabled, false);
  assert.equal(wallet.status().distributionsEnabled, false);

  const second = await wallet.startVerification();
  signedAccount = 'rP9e7r4QxExampleWrongAddress12345';
  const mismatch = await wallet.finishVerification(second.verificationId);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, 'address_mismatch');
  assert.equal(wallet.status().ownerControlVerified, false);

  const third = await wallet.startVerification();
  clock += 10 * 60 * 1000 + 1;
  const expired = await wallet.finishVerification(third.verificationId);
  assert.equal(expired.error, 'verification_expired_or_unknown');

  const missingCreds = createEstateWallet({ config: { ...config, XUMM_SECRET: '' }, pay, now: () => clock });
  assert.equal((await missingCreds.startVerification()).error, 'xaman_credentials_missing');
  const invalidAddress = createEstateWallet({ config: { ...config, ESTATE_TREASURY: 'not-an-address' }, pay, now: () => clock });
  assert.equal((await invalidAddress.startVerification()).error, 'treasury_address_not_configured');

  console.log('Estates Xaman wallet verification: 12 assertions passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
