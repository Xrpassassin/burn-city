'use strict';
// Prepare Xaman owner-approved PLX trustline request only. Never signs or submits.
// The request SDK and validated ledger client are injected for testability.
const C = require('./config');
const {inspectEstateTokenLines}=require('./estate-token-lines');
function validLimit(value) {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/.test(value) && Number(value)>0;
}
async function preparePlxTrustlineRequest({client, xaman, config=C, limit='1000000000'}={}) {
  if (config.NETWORK !== 'mainnet') throw new Error('mainnet_required');
  if (!validLimit(limit)) throw new Error('invalid_limit');
  if (!xaman?.payload || typeof xaman.payload.create !== 'function') throw new Error('xaman_sdk_required');
  const state=await inspectEstateTokenLines(client,config);
  const plx=state.assets.find(x=>x.symbol==='PLX');
  if (!plx || plx.issuer!==config.PLX_ISSUER || plx.currency!==config.PLX_CURRENCY) throw new Error('plx_configuration_mismatch');
  if (plx.exists) return {ok:true,alreadyExists:true,account:state.account,trustline:plx};
  const txjson={
    TransactionType:'TrustSet',Account:state.account,
    LimitAmount:{currency:plx.currency,issuer:plx.issuer,value:limit}
  };
  // Xaman requires a separate user approval; never enable blind automated submission.
  const request=await xaman.payload.create({
    txjson,
    options:{submit:true,expire:10},
    custom_meta:{instruction:'BURN City treasury: review PLX trustline issuer and limit before signing'}
  });
  if (!request?.uuid || !request?.next?.always) throw new Error('xaman_payload_unavailable');
  return {ok:true,alreadyExists:false,account:state.account,payloadId:request.uuid,deeplink:request.next.always,transaction:txjson};
}
module.exports={preparePlxTrustlineRequest};
