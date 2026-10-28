'use strict';
// Read-only bounded issuer issuance discovery. Outputs CANDIDATES, never verified launch supply.
// No writes, wallet signing, transactions submitted, or market-data denominators.
const {TOKENS}=require('../server/ecosystem-supply-reconciliation');
const {decimalUnits}=require('../server/issuer-return-history');
const ENDPOINT='https://s2.ripple.com:51234/';
const MAX_PAGES=30;
function matchedPayment(item,t){
 const tx=item?.tx_json||item?.tx||item?.transaction||item;
 const meta=item?.meta||item?.metaData;
 const delivered=meta?.delivered_amount??meta?.DeliveredAmount;
 if(item?.validated!==true||meta?.TransactionResult!=='tesSUCCESS'||
  tx?.TransactionType!=='Payment'||tx.Account!==t.issuer||
  delivered?.issuer!==t.issuer||
  String(delivered.currency||'').toUpperCase()!==t.currency.toUpperCase())return null;
 const amount=decimalUnits(delivered.value);
 if(!amount||amount.units<=0n)return null;
 return {hash:item.hash||tx.hash||null,ledger_index:item.ledger_index||tx.ledger_index||null,
  destination:tx.Destination,amount:delivered.value,units:amount.units};
}
function summarize(items,t,{complete=false}={}){
 const seen=new Set();const candidates=[];let total=0n,invalid=0;
 for(const item of items){
  const p=matchedPayment(item,t);
  if(!p)continue;
  if(!/^[A-Fa-f0-9]{64}$/.test(p.hash||'')||!Number.isSafeInteger(p.ledger_index)){invalid++;continue;}
  if(seen.has(p.hash))continue;
  seen.add(p.hash);total+=p.units;
  candidates.push({hash:p.hash,ledger_index:p.ledger_index,destination:p.destination,amount:p.amount});
 }
 candidates.sort((a,b)=>a.ledger_index-b.ledger_index);
 const decimal=x=>{const scale=10n**15n;return (x/scale).toString()+(x%scale?'.'+(x%scale).toString().padStart(15,'0').replace(/0+$/,''):'');};
 return {status:'candidate_only',issuer:t.issuer,currency:t.currency,scan_complete:complete&&invalid===0,
  candidate_issuances:candidates,candidate_total_issued:decimal(total),
  rejected_records:invalid,launch_supply_verified:false,
  notice:'Issuer-origin payments are not proof of launch outstanding supply. Pin and independently reconcile gateway_balances at the launch ledger, and check all pre-lock issuance before promotion.'};
}
async function rpc(method,params){
 if(!['account_tx','server_info'].includes(method))throw Error('method not permitted');
 const response=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('XRPL HTTP '+response.status);
 const j=await response.json();if(!j?.result||j.result.error)throw Error(j?.result?.error||'empty RPC');
 return j.result;
}
async function discover(name,{request=rpc,maxPages=MAX_PAGES}={}){
 const t=TOKENS[name];if(!t)throw Error('token must be IMM or XRPyro');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES)throw Error('invalid page cap');
 const info=await request('server_info',{});
 const range=String(info.info?.complete_ledgers||'');
 // The archive must explicitly include genesis-era history. Never treat an incomplete scan as complete.
 const coversGenesis=range.split(',').some(part=>{const m=/^(\d+)-(\d+)$/.exec(part.trim());return m&&Number(m[1])<=2&&Number(m[2])>=2;});
 if(!coversGenesis)return {status:'unverified',token:name,reason:'endpoint does not advertise genesis-era archive coverage',scan_pages:0};
 const items=[];let marker,finished=false,pages=0;const markers=new Set();
 while(pages<maxPages){
  const page=await request('account_tx',{account:t.issuer,ledger_index_min:-1,ledger_index_max:-1,
   forward:true,limit:200,...(marker?{marker}:{})});
  if(!Array.isArray(page.transactions))throw Error('account_tx transactions missing');
  items.push(...page.transactions);pages++;
  marker=page.marker;
  if(!marker){finished=true;break;}
  const key=JSON.stringify(marker);if(markers.has(key))throw Error('repeated pagination marker');
  markers.add(key);
 }
 return {token:name,scan_pages:pages,...summarize(items,t,{complete:finished}),
  page_limit_reached:!finished,ledger_coverage:range};
}
if(require.main===module){
 const name=process.argv[2],limit=process.argv[3]?Number(process.argv[3]):MAX_PAGES;
 discover(name,{maxPages:limit}).then(x=>console.log(JSON.stringify(x,null,2)))
 .catch(e=>{console.error(e.message);process.exitCode=1});
}
module.exports={matchedPayment,summarize,discover};
