'use strict';
// Operator-only, read-only evidence: production books + same-ledger XRPL pools.
// No escrow action, fund movement, reservation, payout or migration mutation.
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {snapshotPool,historicCoverage}=require('../server/estate-replacement-custody-snapshot');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const IMG={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const PLX={currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'};
const RLUSD={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const POOL='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const SCRIPT=`
'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
const database=path.join(process.env.DATA_DIR||'/data','shop.db');
if(!fs.existsSync(database))throw Error('database_not_found');
const db=new DatabaseSync(database,{readOnly:true});
db.exec('PRAGMA query_only=ON');
try{
 const sales=db.prepare("SELECT purchase_tx FROM estate_capital_allocations WHERE policy_version=1").all();
 if(sales.length!==1)throw Error('single_legacy_purchase_required');
 const roots=['/data/gh/cur','/data/patch/app','/app'];
 const liveRoot=roots.find(root=>fs.existsSync(path.join(root,'server','estate-legacy-v2-review.js')));
 if(!liveRoot)throw Error('deployed_legacy_inspection_module_not_found');
 const {inspectLegacyEstateCapital}=require(path.join(liveRoot,'server','estate-legacy-v2-review.js'));
 const {inspectEstateLiabilityRows}=require(path.join(liveRoot,'server','estate-legacy-liability-inventory.js'));
 const p=inspectLegacyEstateCapital(db,sales[0].purchase_tx);
 const count=name=>db.prepare("SELECT COUNT(*) n FROM "+name).get().n;
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
 const pending={};
 for(const n of ['estate_hourly_payouts','estate_img_hourly_entitlements',
   'estate_payout_credits','estate_xrp_profit_payouts','estate_xrp_profit_credits']){
  if(tables.includes(n))pending[n]=count(n);
 }
 console.log(JSON.stringify({readOnly:true,legacy:p,legacyLiabilityTableCounts:pending,
  liabilityInventory:inspectEstateLiabilityRows(db),
  liabilitiesHaveBeenEconomicallyReconciled:false}));
}finally{db.close()}
`;
function remoteAuditSource(){
 // Audit the PR's exact tested liability module before it exists on main.
 // Inline only this source into the isolated remote node process; never
 // copy secrets, edit production files, or use a mutable package.
 const code=fs.readFileSync(require('node:path').join(__dirname,'../server/estate-legacy-liability-inventory.js'),'utf8');
 const anchor=" const {inspectEstateLiabilityRows}=require(path.join(liveRoot,'server','estate-legacy-liability-inventory.js'));";
 if(!SCRIPT.includes(anchor))throw Error('liability_module_injection_anchor_missing');
 return SCRIPT.replace(anchor,
  ' const review={exports:{}}; (function(module){\n'+code+'\n})(review);\n const inspectEstateLiabilityRows=review.exports.inspectEstateLiabilityRows;');
}
async function remote(){
 const token=process.env.FLY_API_TOKEN;
 if(!token)throw Error('fly_readonly_credential_missing');
 const response=await fetch('https://api.machines.dev/v1/apps/burn-city-game/machines/8d2909be270068/exec',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({command:['node','-e',remoteAuditSource()],timeout:35}),
  signal:AbortSignal.timeout(50000)});
 if(!response.ok)throw Error('readonly_remote_http_'+response.status);
 const d=await response.json();
 if(d.exit_code!==0){
  // Never print raw remote stderr or credentials; only a constrained,
  // program-generated exception identifier for diagnosing audit failures.
  const err=String(d.stderr||'');
  const match=err.match(/(?:Error: |throw Error\(')([a-z][a-z0-9_]{2,90})/i);
  const reason=match?match[1]:(/Cannot find module/.test(err)?'required_module_unavailable':'unknown_remote_failure');
  throw Error('readonly_remote_accounting_unavailable_'+reason);
 }
 const r=JSON.parse(String(d.stdout||'').trim());
 if(r.readOnly!==true||r.legacy?.treasuryPauseClearanceAuthorized!==false||
  r.legacy.actualReplacementAssetsVerified!==false)throw Error('unsafe_remote_accounting_result');
 return r;
}
async function rpc(method,params){
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch('https://s1.ripple.com:51234/',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout(18000)});
   if(!response.ok){
    if([429,500,502,503,504].includes(response.status))throw Error('transient_xrpl_http');
    throw Error('xrpl_http_'+response.status);
   }
   const out=(await response.json()).result;
   if(!out||out.error){
    if(['lgrNotFound','serverBusy','tooBusy'].includes(out?.error))
     throw Error('transient_xrpl_node');
    throw Error('xrpl_read_failed_'+String(out?.error||'none'));
   }
   return out;
  }catch(e){
   const msg=String(e.message||'');
   if(attempt===2||!(/fetch failed|transient_xrpl_|timed out|TimeoutError/i.test(msg)))
    throw e;
   await new Promise(done=>setTimeout(done,400*(attempt+1)));
  }
 }
 throw Error('exhausted_xrpl_retry');
}
const expectedPools={
 'img-plx':[IMG,PLX],
 'img-xrp':[IMG,{currency:'XRP'}],
 'img-rlusd':[IMG,RLUSD]
};
async function audit(){
 const accounting=await remote();
 const h=await rpc('ledger',{ledger_index:'validated'});
 const latest=Number(h.ledger_index??h.ledger?.ledger_index);
 if(h.validated!==true||!Number.isSafeInteger(latest)||latest<100)throw Error('validated_snapshot_unavailable');
 // The public XRPL RPC load-balances multiple servers. A small validated
 // offset ensures the chosen ledger is retained on nodes a few closes behind
 // the tip. Never fall forward to an open, unvalidated ledger.
 const height=latest-40;
 const positions=accounting.legacy.positions;
 if(positions.length!==2||positions.some(x=>!ACCOUNT.test(x.poolAccount||'')))throw Error('legacy_positions_not_complete');
 const rawPools=[
  {pair:'img-plx',account:positions.find(x=>x.pair==='img-plx')?.poolAccount},
  {pair:'img-xrp',account:positions.find(x=>x.pair==='img-xrp')?.poolAccount},
  {pair:'img-rlusd',account:POOL}
 ];
 const results={};
 for(const p of rawPools){
  if(!ACCOUNT.test(p.account||''))throw Error('invalid_pool_account');
  const [amm,lines]=await Promise.all([
   rpc('amm_info',{amm_account:p.account,ledger_index:height}),
   rpc('account_lines',{account:TREASURY,peer:p.account,ledger_index:height,limit:400})
  ]);
  const snapshot=snapshotPool({poolAccount:p.account,ledgerIndex:height,
   ammResult:amm,linesResult:lines,expectedAssets:expectedPools[p.pair]});
  const row=positions.find(x=>x.pair===p.pair);
  if(row&&row.lpCurrency!==snapshot.lpCurrency)throw Error('recorded_lp_currency_mismatch');
  results[p.pair]=snapshot;
 }
 const coverage=historicCoverage({
  oldImgPlx:results['img-plx'],oldImgXrp:results['img-xrp'],newImgRlusd:results['img-rlusd'],
  recordedPlxLp:positions.find(x=>x.pair==='img-plx').recordedLpUnits,
  recordedImgXrpLp:positions.find(x=>x.pair==='img-xrp').recordedLpUnits
 });
 const txHash=accounting.legacy.purchaseTx,tx=await rpc('tx',{transaction:txHash,binary:false});
 const body=tx.tx_json||tx;
 const originalPurchaseValidated=tx.validated===true&&tx.meta?.TransactionResult==='tesSUCCESS'&&
  body.TransactionType==='Payment'&&body.Account===accounting.legacy.ownerWallet&&
  body.Destination===TREASURY&&(body.Amount??body.DeliverMax)===accounting.legacy.purchaseDrops&&
  tx.meta.delivered_amount===accounting.legacy.purchaseDrops;
 if(!originalPurchaseValidated)throw Error('original_purchase_onchain_validation_missing');
 const fingerprint=createHash('sha256').update(JSON.stringify({
  purchaseHash:txHash,positionFingerprints:positions.map(x=>x.rawPositionDigest),
  ledger:height,pools:results})).digest('hex');
 const report={readOnly:true,validatedLedger:height,originalPurchaseValidated:true,
  originalPurchaseHashTail:txHash.slice(-8),recordedPurchaseDrops:accounting.legacy.purchaseDrops,
  historicalBudgetDrops:{imgPlx:accounting.legacy.oldPlxBudgetDrops,
   imgXrp:accounting.legacy.oldImgXrpBudgetDrops},
  proposedPolicy2:{imgRlusdDrops:accounting.legacy.proposedImgRlusdDrops,
   reserveDrops:accounting.legacy.proposedXrpReserveDrops,
   actuallyMigrated:false},
  poolSnapshots:results,custody:coverage,
  legacyLiabilityRowCounts:accounting.legacyLiabilityTableCounts,
  legacyLiabilityInventory:accounting.liabilityInventory,
  allLiabilitiesQuantified:false,
  evidenceDigest:fingerprint,
  legallyApproved:false,
  financialMigrationExecuted:false,
  customerPurchasesAuthorized:false,treasuryPauseReleaseAuthorized:false};
 console.log('ESTATES_REPLACEMENT_CUSTODY_EVIDENCE='+JSON.stringify(report));
 return report;
}
if(require.main===module)audit().catch(e=>{
 console.error('ESTATES_REPLACEMENT_EVIDENCE_ERROR='+e.message);process.exitCode=1;
});
module.exports={audit,remote};
