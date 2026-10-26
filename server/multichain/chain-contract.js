'use strict';
// Portable chain capability boundary. This file intentionally has no XRPL or Solana SDK imports.
const CHAINS = Object.freeze(['xrpl','solana']);
const CAPABILITIES = Object.freeze(['walletAuth','assetOwnership','nftMetadata','tokenBalances','marketLiquidity','payments']);
function validateChainConfig(config) {
  if (!config || !CHAINS.includes(config.chain)) throw new Error('Unsupported chain');
  if (typeof config.brand !== 'string' || !/^[a-z0-9][a-z0-9 -]{1,39}$/i.test(config.brand)) throw new Error('Invalid brand');
  if (config.network !== 'mainnet' && config.network !== 'testnet' && config.network !== 'devnet') throw new Error('Invalid network');
  if (config.paymentsEnabled !== false) throw new Error('Payments must be explicitly disabled until separately audited');
  return Object.freeze({chain:config.chain,brand:config.brand,network:config.network,paymentsEnabled:false});
}
function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('Adapter required');
  for (const capability of CAPABILITIES) {
    if (typeof adapter[capability] !== 'function') throw new TypeError('Missing chain adapter capability: '+capability);
  }
  return adapter;
}
function disabledCapability(name) {
  return async () => { throw new Error(name+' not configured: fail closed'); };
}
function createDisabledAdapter() {
  return Object.freeze(Object.fromEntries(CAPABILITIES.map(name=>[name,disabledCapability(name)])));
}
module.exports={CHAINS,CAPABILITIES,validateChainConfig,validateAdapter,createDisabledAdapter};
