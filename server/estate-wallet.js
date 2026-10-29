'use strict';
// Owner-wallet identity check for Estates. This proves control of a public address only;
// it does not enable property sales, authorize automated transfers, or grant custody.
const C = require('./config');
const Pay = require('./payments');
const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

function createEstateWallet({ config = C, pay = Pay, now = Date.now } = {}) {
  const expectedTreasury = String(config.ESTATE_TREASURY || '').trim();
  const pending = new Map();
  let verifiedAt = 0;
  const OWNER_VERIFICATION_TTL_MS = 10 * 60e3;

  function status() {
    const validAddress = ADDRESS_RE.test(expectedTreasury);
    const xamanConfigured = !!(config.XUMM_KEY && config.XUMM_SECRET);
    const verifiedRecently = !!(verifiedAt && now() - verifiedAt >= 0 && now() - verifiedAt < OWNER_VERIFICATION_TTL_MS);
    return {
      provider: 'Xaman',
      network: config.NETWORK,
      expectedAddress: validAddress ? expectedTreasury : null,
      addressConfigured: validAddress,
      xamanConfigured,
      ownerControlVerified: !!(verifiedRecently && validAddress),
      ownerControlVerifiedAt: verifiedRecently ? verifiedAt : null,
      salesEnabled: false,
      distributionsEnabled: false,
      status: !validAddress ? 'treasury_address_not_configured' : !xamanConfigured ? 'xaman_credentials_missing' : verifiedRecently ? 'owner_control_verified_sales_disabled' : 'awaiting_owner_signin'
    };
  }

  async function startVerification() {
    if (!ADDRESS_RE.test(expectedTreasury)) return { ok: false, error: 'treasury_address_not_configured' };
    if (!config.XUMM_KEY || !config.XUMM_SECRET) return { ok: false, error: 'xaman_credentials_missing' };
    const started = await pay.startSignIn();
    if (!started?.sid || !started?.xaman?.uuid) return { ok: false, error: 'xaman_signin_unavailable' };
    pending.set(started.sid, now());
    return { ok: true, verificationId: started.sid, xaman: started.xaman, expiresInSeconds: 600 };
  }

  async function finishVerification(verificationId) {
    const id = String(verificationId || '');
    const created = pending.get(id);
    if (!created || now() - created > 10 * 60e3) {
      pending.delete(id);
      return { ok: false, error: 'verification_expired_or_unknown' };
    }
    const result = await pay.finishSignIn(id);
    if (!result?.ok) return { ok: false, pending: true, error: result?.reason || 'signin_pending' };
    pending.delete(id);
    if (result.account !== expectedTreasury) {
      verifiedAt = 0;
      return { ok: false, error: 'address_mismatch', expectedAddress: expectedTreasury };
    }
    verifiedAt = now();
    return { ok: true, ownerControlVerified: true, network: config.NETWORK, address: expectedTreasury, salesEnabled: false, distributionsEnabled: false };
  }

  return { status, startVerification, finishVerification };
}

module.exports = { ...createEstateWallet(), createEstateWallet };
