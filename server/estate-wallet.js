'use strict';
// Owner-wallet identity check for Estates. This proves control of a public address only;
// it does not enable property sales, authorize automated transfers, or grant custody.
const C = require('./config');
const Pay = require('./payments');

const EXPECTED_TREASURY = String(C.ESTATE_TREASURY || '').trim();
const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const pending = new Map();
let verifiedAt = 0;

function status() {
  const validAddress = ADDRESS_RE.test(EXPECTED_TREASURY);
  const xamanConfigured = !!(C.XUMM_KEY && C.XUMM_SECRET);
  return {
    provider: 'Xaman',
    network: C.NETWORK,
    expectedAddress: validAddress ? EXPECTED_TREASURY : null,
    addressConfigured: validAddress,
    xamanConfigured,
    ownerControlVerified: !!(verifiedAt && validAddress),
    ownerControlVerifiedAt: verifiedAt || null,
    salesEnabled: false,
    distributionsEnabled: false,
    status: !validAddress ? 'treasury_address_not_configured' : !xamanConfigured ? 'xaman_credentials_missing' : verifiedAt ? 'owner_control_verified_sales_disabled' : 'awaiting_owner_signin'
  };
}

async function startVerification() {
  if (!ADDRESS_RE.test(EXPECTED_TREASURY)) return { ok: false, error: 'treasury_address_not_configured' };
  if (!C.XUMM_KEY || !C.XUMM_SECRET) return { ok: false, error: 'xaman_credentials_missing' };
  const started = await Pay.startSignIn();
  if (!started?.sid || !started?.xaman?.uuid) return { ok: false, error: 'xaman_signin_unavailable' };
  pending.set(started.sid, Date.now());
  return { ok: true, verificationId: started.sid, xaman: started.xaman, expiresInSeconds: 600 };
}

async function finishVerification(verificationId) {
  const id = String(verificationId || '');
  const created = pending.get(id);
  if (!created || Date.now() - created > 10 * 60e3) {
    pending.delete(id);
    return { ok: false, error: 'verification_expired_or_unknown' };
  }
  const result = await Pay.finishSignIn(id);
  if (!result?.ok) return { ok: false, pending: true, error: result?.reason || 'signin_pending' };
  pending.delete(id);
  if (result.account !== EXPECTED_TREASURY) {
    verifiedAt = 0;
    return { ok: false, error: 'address_mismatch', expectedAddress: EXPECTED_TREASURY };
  }
  verifiedAt = Date.now();
  return { ok: true, ownerControlVerified: true, network: C.NETWORK, address: EXPECTED_TREASURY, salesEnabled: false, distributionsEnabled: false };
}

module.exports = { status, startVerification, finishVerification };
