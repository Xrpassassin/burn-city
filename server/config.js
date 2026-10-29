// All config from env. Secrets (XAMAN key/secret, treasury seed) are NEVER in code.
const e = process.env;
module.exports = {
  PORT: +(e.PORT || 8080),
  ROOM_SIZE: +(e.ROOM_SIZE || 16),
  TICK_HZ: +(e.TICK_HZ || 30),          // simulation rate
  SNAP_HZ: +(e.SNAP_HZ || 15),          // snapshot rate to clients
  // Game is FREE. Shop sells cosmetics only. Prices in drops are overridable via PRICE_<ITEMID>=drops.
  SESSION_TTL_MS: +(e.SESSION_TTL_MS || 15 * 60e3),   // unpaid purchase-session expiry
  LOGIN_TTL_MS: +(e.LOGIN_TTL_MS || 30 * 86400e3),    // XAMAN sign-in token lifetime
  ADMIN_TOKEN: e.ADMIN_TOKEN || '',                   // required for /admin/* (payout list)
  IMG_ISSUER: e.IMG_ISSUER || 'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd',
  IMG_CURRENCY: e.IMG_CURRENCY || 'IMG',
  PLX_ISSUER: e.PLX_ISSUER || 'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q',
  PLX_CURRENCY: e.PLX_CURRENCY || 'PLX',
  PRIZE_WALLET: e.PRIZE_WALLET_ADDRESS || '',          // funded by you; NOT from sales
  PRIZES: (e.PRIZES || '5000,2500,1000'),             // IMG for rank 1,2,3 (example)
  TREASURY: e.TREASURY_ADDRESS || '',
  ESTATE_TREASURY: e.ESTATE_TREASURY_ADDRESS || 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb', // owner-supplied public address; verification required
  TREASURY_SEED: e.TREASURY_SEED || '',               // only the burn job reads this
  XRPL_WSS: e.XRPL_WSS || 'wss://xrplcluster.com',
  NETWORK: e.XRPL_NETWORK || 'mainnet',               // 'testnet' for tests
  XUMM_KEY: e.XAMAN_API_KEY || e.XUMM_API_KEY || '', XUMM_SECRET: e.XAMAN_API_SECRET || e.XUMM_API_SECRET || '',
  TOKEN_SECRET: e.TOKEN_SECRET || require('crypto').randomBytes(32).toString('hex'),
  BURN_ISSUER: e.BURN_ISSUER || 'rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd',
  BURN_CURRENCY: e.BURN_CURRENCY || 'BURN',           // 3-char or 40-hex; auto-hexed if 4+ chars
  BURN_SHARE: +(e.BURN_SHARE || 0.322),
  BURN_MIN_DROPS: +(e.BURN_MIN_DROPS || 1000000),     // batch when ≥1 XRP owed
  BURN_INTERVAL_MS: +(e.BURN_INTERVAL_MS || 3600e3),
  DRY_RUN: (e.DRY_RUN || 'true') !== 'false',
  MAX_SLIPPAGE: +(e.MAX_SLIPPAGE || 0.03),
  DATA_DIR: e.DATA_DIR || require('path').join(__dirname, '..', 'data'),
  CORS_ORIGIN: e.CORS_ORIGIN || '*',
};
