'use strict';
// Pure, unsigned transaction draft. No submission, wallet signing or token transfer.
const POOL='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const TWO_ASSET=0x00100000;
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
function asset(a){
 if(!a||typeof a!=='object'||a.currency==='XRP'||typeof a.currency!=='string'|| !/^(?:[A-Za-z0-9]{3}|[A-Fa-f0-9]{40})$/.test(a.currency)||!ACCOUNT.test(a.issuer||''))throw new TypeError('issued_asset_required');
 return {currency:a.currency,issuer:a.issuer};
}
function amount(a,v){
 if(typeof v!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v)||!/[1-9]/.test(v)||v.length>32)throw new TypeError('invalid_positive_decimal');
 return {...a,value:v};
}
function buildImgPlxDepositDraft({account,img,plx,imgAmount,plxAmount,poolAddress=POOL}={}){
 if(!ACCOUNT.test(account||''))throw new TypeError('invalid_depositor');
 if(poolAddress!==POOL)throw new TypeError('unexpected_amm_pool');
 const a=asset(img),b=asset(plx);
 if(a.currency===b.currency&&a.issuer===b.issuer)throw new TypeError('identical_assets');
 return Object.freeze({TransactionType:'AMMDeposit',Account:account,Asset:a,Asset2:b,Amount:amount(a,imgAmount),Amount2:amount(b,plxAmount),Flags:TWO_ASSET});
}
module.exports={POOL,TWO_ASSET,buildImgPlxDepositDraft};
