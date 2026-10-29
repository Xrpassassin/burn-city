'use strict';
// Read-only structural inspector. XRPL AMMDeposit/AMMWithdraw are NOT proof of
// realized profit; actual balances, LP token effects and basis require metadata.
const HASH=/^[A-Fa-f0-9]{64}$/;
const TYPES=new Set(['AMMDeposit','AMMWithdraw']);
function sameAsset(asset, expected) {
 return !!asset && typeof asset==='object' && asset.currency===expected.currency && asset.issuer===expected.issuer;
}
function inspectValidatedAmmTx(result,{treasury,imgIssuer,plxIssuer}={}) {
 if(!treasury||!imgIssuer||!plxIssuer)throw new TypeError('trusted_amm_config_required');
 if(!result||result.validated!==true||!Number.isSafeInteger(result.ledger_index)||result.ledger_index<1)throw new Error('unvalidated_amm_transaction');
 const tx=result.tx_json||result;
 if(!TYPES.has(tx.TransactionType))throw new Error('unsupported_amm_transaction_type');
 if(tx.Account!==treasury)throw new Error('not_treasury_amm_transaction');
 if(result.meta?.TransactionResult!=='tesSUCCESS')throw new Error('amm_transaction_not_successful');
 const img={currency:'IMG',issuer:imgIssuer},plx={currency:'PLX',issuer:plxIssuer};
 if(!((sameAsset(tx.Asset,img)&&sameAsset(tx.Asset2,plx))||(sameAsset(tx.Asset,plx)&&sameAsset(tx.Asset2,img))))throw new Error('wrong_amm_asset_pair');
 const hash=tx.hash||result.hash;
 if(!HASH.test(hash||''))throw new Error('missing_amm_transaction_hash');
 return Object.freeze({hash:hash.toUpperCase(),ledgerIndex:result.ledger_index,account:tx.Account,eventKind:tx.TransactionType==='AMMDeposit'?'liquidity_deposit':'liquidity_withdrawal',imgIssuer,plxIssuer,verification:'validated_structure_only',amountsVerified:false,principalBasisVerified:false,distributable:false});
}
async function verifyAmmTx(client,txHash,config){
 if(!HASH.test(txHash||''))throw new TypeError('invalid_transaction_hash');
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 const response=await client.request({command:'tx',transaction:txHash.toUpperCase()});
 return inspectValidatedAmmTx(response.result,config);
}
module.exports={inspectValidatedAmmTx,verifyAmmTx};
