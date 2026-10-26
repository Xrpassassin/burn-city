'use strict';
const {validateChainConfig}=require('./chain-contract');
const PRESETS=Object.freeze({
  burn: Object.freeze({chain:'xrpl',brand:'BURN City',network:'mainnet',paymentsEnabled:false}),
  sol: Object.freeze({chain:'solana',brand:'SOL City',network:'mainnet',paymentsEnabled:false}),
});
function resolveWorldProfile(id) {
  if (!Object.prototype.hasOwnProperty.call(PRESETS,id)) throw new Error('Unknown world profile');
  const config=validateChainConfig(PRESETS[id]);
  return Object.freeze({...config,id,namespace:'world:'+id+':v1',
    // No shared wallet sessions, ownership records, payment sessions or ledgers.
    dataDirectoryKey:'world-'+id,
    enabledFeatures:Object.freeze({wallets:false,nftOwnership:false,liquidity:false,payments:false}),
  });
}
module.exports={resolveWorldProfile,PRESETS};
