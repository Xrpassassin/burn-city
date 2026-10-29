'use strict';
// Read-only RippleState trustline delta extractor. AccountRoot XRP and AMM LP
// balance changes are not inferred. RippleState Balance is signed relative to
// LowLimit issuer/account, so normalize to the configured treasury's side.
function parseDecimal(v) {
 if(typeof v!=='string'||!/^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v))throw new TypeError('invalid_trustline_balance');
 const neg=v.startsWith('-');const abs=v.replace(/^[-+]/,'');const [whole,frac='']=abs.split('.');
 if(frac.length>15)throw new Error('trustline_precision_exceeds_15');
 const scaled=BigInt(whole)*10n**15n+BigInt(frac.padEnd(15,'0')||'0');
 return neg?-scaled:scaled;
}
function extractTreasuryTrustlineDeltas(result,{treasury,imgIssuer,plxIssuer}={}) {
 if(!result||result.validated!==true||result.meta?.TransactionResult!=='tesSUCCESS'||!Array.isArray(result.meta.AffectedNodes))throw new Error('validated_metadata_required');
 if(!treasury||!imgIssuer||!plxIssuer)throw new TypeError('trusted_config_required');
 const expected=new Map([['IMG',imgIssuer],['PLX',plxIssuer]]);
 const deltas={IMG:0n,PLX:0n};
 for(const wrapper of result.meta.AffectedNodes) {
  const type=Object.keys(wrapper)[0],node=wrapper[type];
  if(!node||node.LedgerEntryType!=='RippleState')continue;
  const final=node.FinalFields||node.NewFields||{};
  const previous=node.PreviousFields||{};
  const low=final.LowLimit,high=final.HighLimit,balance=final.Balance;
  if(!low||!high||!balance)continue;
  const treasuryIsLow=low.issuer===treasury,treasuryIsHigh=high.issuer===treasury;
  if(treasuryIsLow===treasuryIsHigh)continue;
  const counterparty=treasuryIsLow?high.issuer:low.issuer;
  const currency=balance.currency;
  if(expected.get(currency)!==counterparty)continue;
  const before=type==='CreatedNode'?'0':previous.Balance?.value;
  const after=type==='DeletedNode'?'0':balance.value;
  if(before===undefined||after===undefined)throw new Error('incomplete_trustline_delta');
  const delta=parseDecimal(after)-parseDecimal(before);
  deltas[currency]+=(treasuryIsLow?delta:-delta);
 }
 const fmt=v=>{const sign=v<0n?'-':'';const n=v<0n?-v:v;const w=n/10n**15n;const f=(n%10n**15n).toString().padStart(15,'0').replace(/0+$/,'');return sign+w.toString()+(f?'.'+f:'');};
 return Object.freeze({imgDelta:fmt(deltas.IMG),plxDelta:fmt(deltas.PLX),status:'trustline_deltas_only',lpTokenDeltaVerified:false,principalBasisVerified:false,distributable:false});
}
module.exports={extractTreasuryTrustlineDeltas};
