'use strict';
// Derive AMM account and LP currency from a validated amm_info response,
// never from a client-supplied LP identifier.
function matches(amount,currency,issuer){
 return amount&&typeof amount==='object'&&amount.currency===currency&&amount.issuer===issuer;
}
function inspectAmmIdentity(result,{imgIssuer,plxIssuer}={}){
 if(!imgIssuer||!plxIssuer)throw new TypeError('trusted_asset_issuers_required');
 if(!result||result.validated!==true||!result.amm)throw new Error('validated_amm_info_required');
 const amm=result.amm;
 const assets=[amm.amount,amm.amount2];
 const img=assets.some(a=>matches(a,'IMG',imgIssuer));
 const plx=assets.some(a=>matches(a,'PLX',plxIssuer));
 if(!img||!plx)throw new Error('amm_asset_pair_mismatch');
 if(typeof amm.account!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(amm.account))throw new Error('invalid_amm_account');
 if(!amm.lp_token||amm.lp_token.issuer!==amm.account||typeof amm.lp_token.currency!=='string'||!/^03[A-Fa-f0-9]{38}$/.test(amm.lp_token.currency))throw new Error('invalid_amm_lp_token');
 if(!Number.isSafeInteger(result.ledger_index)||result.ledger_index<1)throw new Error('validated_ledger_index_required');
 return Object.freeze({ammAccount:amm.account,lpCurrency:amm.lp_token.currency,ledgerIndex:result.ledger_index,assetPair:'IMG/PLX',verifiedFrom:'validated_amm_info',distributable:false});
}
async function fetchAmmIdentity(client,{imgIssuer,plxIssuer}={}){
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 const response=await client.request({command:'amm_info',asset:{currency:'IMG',issuer:imgIssuer},asset2:{currency:'PLX',issuer:plxIssuer},ledger_index:'validated'});
 return inspectAmmIdentity(response.result,{imgIssuer,plxIssuer});
}
module.exports={inspectAmmIdentity,fetchAmmIdentity};
