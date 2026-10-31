'use strict';
const BigNumber=require('bignumber.js');
const N=BigNumber.clone({DECIMAL_PLACES:100,ROUNDING_MODE:BigNumber.ROUND_DOWN,EXPONENTIAL_AT:1e9});
const value=s=>{if(typeof s!=='string'||s.length>256||!/^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$/.test(s))throw Error('invalid_ledger_amount');const n=new N(s);if(!n.isFinite()||n.abs().gte('1e96')||(!n.isZero()&&n.abs().lt('1e-96')))throw Error('ledger_amount_out_of_range');return n;};
const token=n=>{n=new N(n).precision(16,N.ROUND_DOWN);if(!n.isPositive()||n.isZero())throw Error('below_token_precision');return n.toFixed();};
const drops=n=>new N(n).integerValue(N.ROUND_DOWN).toFixed(0);
const ceil=n=>new N(n).integerValue(N.ROUND_UP).toFixed(0);
function sameAmount(a,b){if(typeof a==='string'||typeof b==='string')return a===b;return !!a&&!!b&&a.currency===b.currency&&a.issuer===b.issuer&&value(a.value).eq(value(b.value));}
function balanceDelta(result,account,asset){
 let sum=new N(0),matched=0;
 if(result?.validated!==true||result.meta?.TransactionResult!=='tesSUCCESS'||!Array.isArray(result.meta.AffectedNodes))throw Error('validated_metadata_required');
 for(const wrapper of result.meta.AffectedNodes){
  const kind=Object.keys(wrapper)[0],node=wrapper[kind],f=node?.FinalFields||node?.NewFields,p=node?.PreviousFields;
  if(asset.currency==='XRP'){
   if(node?.LedgerEntryType!=='AccountRoot'||f?.Account!==account)continue;
   if(kind!=='ModifiedNode'||!/^\d+$/.test(p?.Balance||'')||!/^\d+$/.test(f.Balance||''))throw Error('incomplete_xrp_delta');
   sum=sum.plus(value(f.Balance).minus(value(p.Balance)));matched++;
  }else{
   if(node?.LedgerEntryType!=='RippleState'||f?.Balance?.currency!==asset.currency)continue;
   const low=f.LowLimit?.issuer,high=f.HighLimit?.issuer;
   if(!((low===account&&high===asset.issuer)||(high===account&&low===asset.issuer)))continue;
   const before=kind==='CreatedNode'?'0':p?.Balance?.value,after=kind==='DeletedNode'?'0':f.Balance.value;
   if(before===undefined||after===undefined)throw Error('incomplete_token_delta');
   sum=sum.plus(value(after).minus(value(before)).times(low===account?1:-1));matched++;
  }
 }
 if(matched!==1)throw Error('unique_asset_delta_required');
 return sum;
}
function xrpMovement(result,account){const tx=result.tx_json||result;if(!/^\d+$/.test(tx.Fee||''))throw Error('invalid_transaction_fee');return balanceDelta(result,account,{currency:'XRP'}).plus(value(tx.Fee));}
function inspectPool(result,{asset,other,poolAccount}={}){
 const a=result?.amm,amounts=[a?.amount,a?.amount2];
 const find=issue=>amounts.find(v=>issue.currency==='XRP'?typeof v==='string':v?.currency===issue.currency&&v.issuer===issue.issuer);
 const av=find(asset),bv=find(other),aa=typeof av==='string'?av:av?.value,bb=typeof bv==='string'?bv:bv?.value;
 if(a?.asset_frozen===true||a?.asset2_frozen===true||result?.validated!==true||!aa||!bb||!value(aa).gt(0)||!value(bb).gt(0)||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a?.account||'')||(poolAccount&&a.account!==poolAccount)||!/^03[A-Fa-f0-9]{38}$/.test(a?.lp_token?.currency||'')||a.lp_token.issuer!==a.account||!value(a.lp_token.value).gt(0)||!Number.isSafeInteger(a.trading_fee)||a.trading_fee<0||a.trading_fee>1000)throw Error('validated_pool_identity_required');
 return {account:a.account,lp:{currency:a.lp_token.currency,issuer:a.account},a:value(aa),b:value(bb),supply:value(a.lp_token.value),fee:a.trading_fee};
}
// Exact-output quote under a hard XRP SendMax. The haircut does not increase spend.
function buyQuote(pool,budget,bps=300){
 const net=new N(100000-pool.fee),n=value(budget);
 return token(pool.b.times(n).times(net).div(pool.a.times(100000).plus(n.times(net))).times(10000-bps).div(10000));
}
function liquidationQuote(pool,lp){
 const share=value(lp).div(pool.supply);if(!share.gt(0)||!share.lt(1))throw Error('unsupported_liquidation_share');
 const x=pool.a.times(share),img=pool.b.times(share),xr=pool.a.minus(x),ir=pool.b.minus(img),net=100000-pool.fee;
 return drops(x.plus(xr.times(img).times(net).div(ir.times(100000).plus(img.times(net)))));
}

function roundingTolerance(result,account,asset){
 let tolerance=new N(0);
 for(const wrapper of result.meta?.AffectedNodes||[]){
  const n=wrapper.ModifiedNode||wrapper.CreatedNode||wrapper.DeletedNode,f=n?.FinalFields||n?.NewFields;
  if(n?.LedgerEntryType!=='RippleState'||f?.Balance?.currency!==asset.currency)continue;
  const low=f.LowLimit?.issuer,high=f.HighLimit?.issuer;
  if(!((low===account&&high===asset.issuer)||(high===account&&low===asset.issuer)))continue;
  for(const s of [f.Balance.value,n.PreviousFields?.Balance?.value])if(s!==undefined){const n=value(s).abs();if(n.gt(0))tolerance=tolerance.plus(new N(10).pow(n.e-15));}
 }
 return tolerance;
}
function boundedTokenDebit(result,account,asset,maximum){
 const actual=balanceDelta(result,account,asset).negated(),cap=value(maximum),tolerance=roundingTolerance(result,account,asset);
 if(!actual.gt(0)||tolerance.gt(cap.div('1e8'))||actual.gt(cap.plus(tolerance)))throw Error('token_debit_exceeds_bound');
 // STAmount balance rounding can differ from the nominal transfer by one ULP.
 // Never book more than the signed asset cap, or leave an over-stated inventory.
 return N.minimum(cap,actual.precision(16,N.ROUND_UP));
}
function verifiedTokenCredit(result,account,asset,nominal){
 const actual=balanceDelta(result,account,asset),expected=value(nominal),tolerance=roundingTolerance(result,account,asset);
 if(!actual.gt(0)||tolerance.gt(expected.div('1e8'))||actual.minus(expected).abs().gt(tolerance))throw Error('token_credit_proof_mismatch');
 return value(token(N.minimum(actual,expected)));
}
function verifiedLpBurn(result,account,asset,nominal){
 const actual=balanceDelta(result,account,asset).negated(),expected=value(nominal),tolerance=roundingTolerance(result,account,asset);
 if(!actual.gt(0)||tolerance.gt(expected.div('1e8'))||actual.minus(expected).abs().gt(tolerance))throw Error('lp_burn_proof_mismatch');
 return actual;
}

module.exports={N,value,token,drops,ceil,sameAmount,balanceDelta,roundingTolerance,boundedTokenDebit,verifiedTokenCredit,verifiedLpBurn,xrpMovement,inspectPool,buyQuote,liquidationQuote};
