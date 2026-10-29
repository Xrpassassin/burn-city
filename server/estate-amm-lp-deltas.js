'use strict';
// LP tokens are issued by the AMM account, not the IMG/PLX token issuers.
// Extract only a caller-configured, independently verified AMM account/currency.
function decimal(v){
 if(typeof v!=='string'||!/^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v))throw new TypeError('invalid_lp_balance');
 const sign=v[0]==='-'?-1n:1n;const [a,b='']=v.replace(/^[-+]/,'').split('.');
 if(b.length>15)throw new Error('lp_precision_exceeds_15');
 return sign*(BigInt(a)*10n**15n+BigInt(b.padEnd(15,'0')||'0'));
}
function format(v){const neg=v<0n?'-':'';const n=v<0n?-v:v;const f=(n%10n**15n).toString().padStart(15,'0').replace(/0+$/,'');return neg+(n/10n**15n).toString()+(f?'.'+f:'');}
function extractTreasuryLpDelta(result,{treasury,ammAccount,lpCurrency}={}){
 if(!treasury||!ammAccount||typeof lpCurrency!=='string'||!lpCurrency)throw new TypeError('verified_amm_lp_config_required');
 if(!result||result.validated!==true||result.meta?.TransactionResult!=='tesSUCCESS'||!Array.isArray(result.meta.AffectedNodes))throw new Error('validated_metadata_required');
 let total=0n,matched=0;
 for(const wrapper of result.meta.AffectedNodes){
  const type=Object.keys(wrapper)[0],node=wrapper[type];
  if(!node||node.LedgerEntryType!=='RippleState')continue;
  const final=node.FinalFields||node.NewFields||{},previous=node.PreviousFields||{};
  const low=final.LowLimit,high=final.HighLimit,bal=final.Balance;
  if(!low||!high||!bal||bal.currency!==lpCurrency)continue;
  const isLow=low.issuer===treasury&&high.issuer===ammAccount;
  const isHigh=high.issuer===treasury&&low.issuer===ammAccount;
  if(!isLow&&!isHigh)continue;
  const before=type==='CreatedNode'?'0':previous.Balance?.value;
  const after=type==='DeletedNode'?'0':bal.value;
  if(before===undefined||after===undefined)throw new Error('incomplete_lp_delta');
  total+=(isLow?1n:-1n)*(decimal(after)-decimal(before));matched++;
 }
 return Object.freeze({lpTokenDelta:format(total),matchedTrustlines:matched,lpAccount:ammAccount,lpCurrency,principalBasisVerified:false,distributable:false});
}
module.exports={extractTreasuryLpDelta};
