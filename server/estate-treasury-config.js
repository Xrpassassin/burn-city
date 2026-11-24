'use strict';
// Public account configuration only. Never store seeds, secret keys or signing credentials here.
const TREASURY_ADDRESS = 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const TREASURY_MODE = 'read-only';
const TRANSFERS_ENABLED = false;
const AMM_TRADES_ENABLED = false;
const REWARD_PAYOUTS_ENABLED = false;
const ESTATES_TREASURY = Object.freeze({
  address: TREASURY_ADDRESS,
  mode: TREASURY_MODE,
  transfersEnabled: TRANSFERS_ENABLED,
  ammTradesEnabled: AMM_TRADES_ENABLED,
  rewardPayoutsEnabled: REWARD_PAYOUTS_ENABLED
});
function requireReadOnlyTreasury(address) {
  if (address !== TREASURY_ADDRESS) throw new Error('treasury_account_mismatch');
  return ESTATES_TREASURY;
}
module.exports = { ESTATES_TREASURY, requireReadOnlyTreasury };
