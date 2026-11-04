'use strict';
// Pure computation of validated XRPL pool balances. Returns gross proportional
// reserve estimates only: NOT guaranteed withdrawal, executable price, profits,
// proof of beneficial ownership, or release of historical customer capital.
const BigNumber=require('bignumber.js');
const N=BigNumber.clone({DECIMAL_PLACES:30,ROUNDING_MODE:BigNumber.ROUND_DOWN,EXPONENTIAL_AT:1e9});
const CURRENCY=/^(?:[A-Za-z0-9]{3}|[A-Fa-f0-9]{40})$/;
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
function decimal(s,{allowZero=true}={}){
 if(typeof s!=='string'||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(s))
  throw Error('invalid_nonnegative_balance');
 const n=new N(s);if(!n.isFinite()||n.lt(0)||(!allowZero&&n.isZero()))
  throw Error('invalid_nonnegative_balance');
 return n;
}
function amount(asset){
 if(typeof asset==='string'){
  if(!/^(0|[1-9][0-9]*)$/.test(asset))throw Error('invalid_xrp_drops');
  return Object.freeze({currency:'XRP',units:'drops',issuer:null,value:asset});
 }
 if(!asset||!CURRENCY.test(asset.currency||'')||!ACCOUNT.test(asset.issuer||''))
  throw Error('invalid_issued_asset');
 return Object.freeze({currency:asset.currency,issuer:asset.issuer,units:'issued',value:decimal(asset.value).toFixed()});
}
function snapshotPool({poolAccount,ammResult,linesResult,ledgerIndex,expectedAssets}){
 if(!ACCOUNT.test(poolAccount||'')||!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1)
  throw Error('verified_pool_identity_required');
 if(ammResult?.validated!==true||linesResult?.validated!==true||
   Number(ammResult.ledger_index)!==ledgerIndex||
   Number(linesResult.ledger_index)!==ledgerIndex||
   linesResult.marker||!Array.isArray(linesResult.lines))
  throw Error('incomplete_same_ledger_snapshot');
 const amm=ammResult.amm;
 if(amm?.account!==poolAccount||amm.lp_token?.issuer!==poolAccount||
   !CURRENCY.test(amm.lp_token.currency||''))throw Error('pool_or_lp_issuer_mismatch');
 const assets=[amount(amm.amount),amount(amm.amount2)];
 const identifier=x=>x.currency==='XRP'?'XRP':x.currency+':'+x.issuer;
 if(!Array.isArray(expectedAssets)||expectedAssets.length!==2||
   assets.map(identifier).sort().join('|')!==expectedAssets.map(identifier).sort().join('|'))
  throw Error('unexpected_pool_asset_pair');
 const supply=decimal(amm.lp_token.value,{allowZero:false});
 const matches=linesResult.lines.filter(x=>x.account===poolAccount&&x.currency===amm.lp_token.currency);
 if(matches.length>1)throw Error('ambiguous_lp_trustline');
 const held=decimal(matches.length?matches[0].balance:'0');
 if(held.gt(supply))throw Error('treasury_lp_exceeds_total_supply');
 const heldRatio=held.div(supply);
 const claim=assets.map(x=>Object.freeze({...x,
  grossTreasuryProRata:x.units==='drops'?decimal(x.value).times(heldRatio).integerValue(N.ROUND_DOWN).toFixed(0):decimal(x.value).times(heldRatio).toFixed(),
  executableValueVerified:false}));
 return Object.freeze({poolAccount,ledgerIndex,
  lpCurrency:amm.lp_token.currency,totalLpSupply:supply.toFixed(),treasuryLpHeld:held.toFixed(),
  grossTreasuryShareRatio:heldRatio.toFixed(),assets:claim,
  reservesAreGrossNotWithdrawableQuote:true,
  replacementCapitalProven:false,rewardProfitsVerified:false,
  treasuryReleaseAuthorized:false});
}
function historicCoverage({oldImgPlx,oldImgXrp,newImgRlusd,recordedPlxLp,recordedImgXrpLp}){
 if(!oldImgPlx||!oldImgXrp||!newImgRlusd)throw Error('all_three_pools_required');
 const p=decimal(recordedPlxLp,{allowZero:false}),x=decimal(recordedImgXrpLp,{allowZero:false});
 const oldCoverage=decimal(oldImgPlx.treasuryLpHeld).gte(p),xrpCoverage=decimal(oldImgXrp.treasuryLpHeld).gte(x);
 const newHeld=decimal(newImgRlusd.treasuryLpHeld).gt(0);
 return Object.freeze({recordedLegacyImgPlxLp:p.toFixed(),recordedLegacyImgXrpLp:x.toFixed(),
  legacyPlxLpCovered:oldCoverage,legacyImgXrpLpCovered:xrpCoverage,
  newImgRlusdLpPresent:newHeld,
  newImgRlusdCustomerAttributionVerified:false,
  replacementEconomicValueVerified:false,
  legacyCustomerObligationReconciled:false,
  purchaseActivationAuthorized:false,rewardActivationAuthorized:false});
}
module.exports={snapshotPool,historicCoverage};
