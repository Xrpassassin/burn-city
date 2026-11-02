'use strict';
// Standalone read-only comparison of live treasury LP tokens with ALL
// customer-funded legacy positions. Not a valuation or legal clearance.
const fs=require('node:fs');
const BigNumber=require('bignumber.js');
const N=BigNumber.clone({DECIMAL_PLACES:40,ROUNDING_MODE:BigNumber.ROUND_DOWN});
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const positive=value=>{
 if(typeof value!=='string'||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value))
  throw Error('invalid_lp_balance');
 const n=new N(value);if(!n.isFinite()||n.lt(0))throw Error('invalid_lp_balance');return n;
};
async function query(method,params){
 const r=await fetch('https://s1.ripple.com:51234/',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('xrpl_read_http_'+r.status);
 const d=(await r.json()).result;
 if(!d||d.error)throw Error('xrpl_read_result_'+String(d?.error||'empty'));
 return d;
}
async function audit(){
 if(!process.env.FLY_API_TOKEN)throw Error('fly_credential_required');
 const inspect=fs.readFileSync('scripts/estate-legacy-customer-attribution-readonly.cjs','utf8');
 const url='https://api.machines.dev/v1/apps/burn-city-game/machines/8d2909be270068/exec';
 const response=await fetch(url,{method:'POST',
  headers:{authorization:'Bearer '+process.env.FLY_API_TOKEN,'content-type':'application/json'},
  body:JSON.stringify({command:['node','-e',inspect],timeout:30}),
  signal:AbortSignal.timeout(48000)});
 if(!response.ok)throw Error('fly_readonly_ledger_http_'+response.status);
 const data=await response.json();if(data.exit_code!==0)throw Error('fly_readonly_ledger_failed');
 const book=JSON.parse(String(data.stdout||'').trim());
 if(book.readOnly!==true||book.treasuryPauseReleaseAuthorized!==false)
  throw Error('unsafe_accounting_evidence');
 const positions=book.sections.legacyPositions.filter(p=>p.state==='invested'&&p.values.lp&&
  positive(p.values.lp).gt(0));
 if(positions.length!==2)throw Error('legacy_position_inventory_incomplete');
 const h=await query('ledger',{ledger_index:'validated'});
 const index=Number(h.ledger_index??h.ledger?.ledger_index);
 if(h.validated!==true||!Number.isSafeInteger(index)||index<1)throw Error('validated_snapshot_required');
 const pools=[];
 for(const account of [...new Set(positions.map(p=>p.poolAccount))]){
  if(!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(account||''))throw Error('invalid_position_pool');
  const [amm,lines]=await Promise.all([
   query('amm_info',{amm_account:account,ledger_index:index}),
   query('account_lines',{account:TREASURY,peer:account,ledger_index:index,limit:400})
  ]);
  if(amm.validated!==true||lines.validated!==true||lines.marker||
    Number(amm.ledger_index)!==index||Number(lines.ledger_index)!==index)
   throw Error('incomplete_validated_pool_inventory');
  const lp=amm.amm?.lp_token;
  if(amm.amm?.account!==account||lp?.issuer!==account)throw Error('unexpected_pool_identity');
  const matched=positions.filter(p=>p.poolAccount===account);
  if(matched.some(p=>p.lpCurrency!==lp.currency))throw Error('job_lp_currency_does_not_match_pool');
  const owned=(lines.lines||[]).filter(x=>x.account===account&&x.currency===lp.currency);
  if(owned.length>1)throw Error('duplicate_lp_trustline');
  const actual=positive(owned[0]?.balance||'0');
  const accounted=matched.reduce((total,p)=>total.plus(positive(p.values.lp)),new N(0));
  const adequate=actual.gte(accounted);
  pools.push({pool:account,lpCurrency:lp.currency,
   customerPositionCount:matched.length,accountedLp:accounted.toFixed(),
   treasuryHeldLp:actual.toFixed(),unattributedLp:adequate?actual.minus(accounted).toFixed():'0',
   fullyBackedByTreasuryLp:adequate,
   capitalCostBasisDrops:matched.reduce((n,p)=>n+BigInt(p.values.basis||'0'),0n).toString(),
   principalMarketValueProven:false});
 }
 const report={readOnly:true,ledgerIndex:index,customerPositionCount:positions.length,
  verifiedLpInventory:pools,allRecordedLpBalancesCovered:pools.every(x=>x.fullyBackedByTreasuryLp),
  originalOwnershipAndLiabilitiesReconciled:false,
  principalValuePreservedNotGuaranteed:true,
  treasuryPauseReleaseAuthorized:false,customerPurchasesAuthorized:false};
 console.log('ESTATES_LIVE_CUSTOMER_LP_COVERAGE='+JSON.stringify(report));
 if(!report.allRecordedLpBalancesCovered)throw Error('customer_lp_inventory_shortfall');
 return report;
}
if(require.main===module)audit().catch(e=>{console.error('ESTATES_LP_COVERAGE_ERROR='+e.message);process.exitCode=1;});
module.exports={audit,positive};
