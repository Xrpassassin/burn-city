'use strict';
const {inspectPool,value,drops,N}=require('./estate-liquidity-ledger');
const RLUSD=Object.freeze({currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'});
// Read-only deployment preflight. No payload creation, signing or submission.
async function inspectEstateRlusdReadiness({client,treasury,imgIssuer,poolAccount,maxImpactBps=100}={}){
 if(!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(poolAccount||''))throw Error('img_rlusd_pool_account_required');
 const IMG={currency:'IMG',issuer:imgIssuer},XRP={currency:'XRP'};
 const r=(await client.request({command:'ledger',ledger_index:'validated'})).result,h=r?.ledger_hash||r?.ledger?.ledger_hash;
 if(r?.validated!==true||!/^[A-Fa-f0-9]{64}$/.test(h||''))throw Error('validated_ledger_required');
 const pools=[];
 for(const [asset,other,pin] of [[IMG,RLUSD,poolAccount],[XRP,IMG,undefined],[XRP,RLUSD,undefined]]){
  const p=(await client.request({command:'amm_info',asset,asset2:other,ledger_hash:h})).result;
  if(p?.ledger_hash!==h)throw Error('pool_ledger_mismatch');pools.push(inspectPool(p,{asset,other,poolAccount:pin}));
 }
 const [target,img,stable]=pools,market=img.a.div(img.b).times(stable.b).div(stable.a),signedDeviation=target.b.div(target.a).div(market).minus(1).times(10000),deviation=signedDeviation.abs();
 const blockers=[];
 if(deviation.gt(maxImpactBps))blockers.push('img_rlusd_market_price_mismatch');
 const trustlines=[];
 for(const issue of [IMG,RLUSD]){
  const info=(await client.request({command:'account_info',account:issue.issuer,ledger_hash:h})).result;
  if(info?.validated!==true||info.ledger_hash!==h||info.account_data?.Account!==issue.issuer)throw Error('validated_issuer_required');
  const flags=info.account_data.Flags||0;
  if((info.account_data.TransferRate||1000000000)!==1000000000||(flags&0x00400000))blockers.push('unsupported_issuer_state');
  let marker,line;
  for(let page=0;page<10;page++){
   const result=(await client.request({command:'account_lines',account:treasury,peer:issue.issuer,ledger_hash:h,limit:400,...(marker?{marker}:{})})).result;
   if(result?.validated!==true||result.ledger_hash!==h||!Array.isArray(result.lines))throw Error('validated_trustline_required');
   line=result.lines.find(l=>l.account===issue.issuer&&l.currency===issue.currency)||line;marker=result.marker;if(!marker)break;
  }
  const ready=!marker&&!!line&&!line.freeze&&!line.freeze_peer&&(!(flags&0x00040000)||line.peer_authorized===true)&&value(line.limit).gt(value(line.balance));
  if(!ready)blockers.push(issue.currency==='IMG'?'treasury_img_trustline_required':'treasury_rlusd_trustline_required');
  trustlines.push({asset:issue.currency==='IMG'?'IMG':'RLUSD',ready});
 }
 const maxBudget=N.minimum(img.a,stable.a).times(maxImpactBps).div(10000-maxImpactBps).times(2).times(10000).div(9900);
 return {ready:blockers.length===0,blockers,ledgerIndex:Number(r.ledger_index??r.ledger?.ledger_index),poolAccount:target.account,treasury,trustlines,
  indicativeMaxPurchaseDrops:drops(maxBudget),priceDeviationBps:deviation.toFixed(2),signedPriceDeviationBps:signedDeviation.toFixed(2),\n  poolPriceRlusdPerImg:target.b.div(target.a).toFixed(12),referencePriceRlusdPerImg:market.toFixed(12),\n  priceDirection:signedDeviation.gt(0)?'img_more_expensive_in_target_pool':signedDeviation.lt(0)?'img_cheaper_in_target_pool':'aligned',\n  priceRemediation:'read_only_diagnostic_no_transaction_or_guard_override',poolTradingFeeBps:target.fee/10,
  scope:'pool_identity_trustlines_and_market_depth_only',signingAndOperatingReserveVerified:false};
}
module.exports={inspectEstateRlusdReadiness,RLUSD};
