'use strict';
// Read-only validated-ledger AMM lookup. No wallet signing, deposits or payouts.
const {POOL}=require('./img-plx-amm-deposit-draft');
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
function normalizeIssuedAmount(a){
 if(!a||typeof a!=='object'||typeof a.currency!=='string'||typeof a.issuer!=='string'||!ACCOUNT.test(a.issuer)||typeof a.value!=='string')throw new Error('unexpected_pool_asset');
 return {currency:a.currency,issuer:a.issuer,value:a.value};
}
function parseValidatedImgPlxPool(response,{poolAddress=POOL}={}){
 const r=response?.result;
 if(r?.validated!==true||!Number.isSafeInteger(r.ledger_index))throw new Error('amm_ledger_not_validated');
 const amm=r.amm;
 if(!amm||amm.account!==poolAddress)throw new Error('amm_account_mismatch');
 const a=normalizeIssuedAmount(amm.amount),b=normalizeIssuedAmount(amm.amount2);
 const currencies=[a.currency,b.currency];
 if(!currencies.includes('IMG')||!currencies.includes('PLX'))throw new Error('amm_assets_mismatch');
 if(!amm.lp_token||amm.lp_token.issuer!==poolAddress||typeof amm.lp_token.value!=='string')throw new Error('amm_lp_token_mismatch');
 return Object.freeze({poolAddress,ledgerIndex:r.ledger_index,img:a.currency==='IMG'?a:b,plx:a.currency==='PLX'?a:b,lpToken:amm.lp_token,tradingFee:amm.trading_fee});
}
async function inspectImgPlxPool(client,{poolAddress=POOL}={}){
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 const response=await client.request({command:'amm_info',amm_account:poolAddress,ledger_index:'validated'});
 return parseValidatedImgPlxPool(response,{poolAddress});
}
module.exports={parseValidatedImgPlxPool,inspectImgPlxPool};
