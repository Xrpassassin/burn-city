'use strict';
// Executed on the existing Fly machine after the expected merged SHA is live.
// Does not print secrets or signed blobs. Preflight/status are read-only.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{DatabaseSync}=require('node:sqlite');
const arg=['preflight','bootstrap','unpause','pause','status'].includes(process.argv[1])?1:2;
const mode=process.argv[arg],expected=process.argv[arg+1],root=process.env.DATA_DIR||'/data',code=path.join(root,'gh/cur');
if(!['preflight','bootstrap','unpause','pause','status'].includes(mode)||!/^[a-f0-9]{40}$/.test(expected||''))throw Error('explicit_mode_and_merged_commit_required');
if(fs.readFileSync(path.join(root,'gh/SHA'),'utf8').trim()!==expected)throw Error('live_commit_mismatch');
const req=createRequire(path.join(code,'package.json')),C=req('./server/config'),xrpl=req('xrpl');
const {balanceDelta,inspectPool}=req('./server/estate-liquidity-ledger');
const {createImgRewardVerifier}=req('./server/estate-img-xrpl-receipt-verifier');
const {POOL,SOURCE}=req('./server/estate-hourly-runtime');
const treasury=C.ESTATE_TREASURY,IMG={currency:'IMG',issuer:C.IMG_ISSUER},PLX={currency:'PLX',issuer:C.PLX_ISSUER},XRP={currency:'XRP'};
const knownDeposit='CDE8F708EB0EF12C796BB675679B0971EAF110364232874D72824AB789A7069F';
let db,client;
function openDb(){if(!db){db=new DatabaseSync(path.join(root,'shop.db'),{readOnly:true});db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000');}return db;}
function exists(name){return !!openDb().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function count(name,where=''){return exists(name)?openDb().prepare('SELECT COUNT(*) n FROM '+name+where).get().n:0;}
function pauseState(){const file=path.join(root,'pause.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{paused:false};}
async function rpc(){if(!client){client=new xrpl.Client(C.XRPL_WSS,{connectionTimeout:8000,timeout:8000});await client.connect();const request=client.request.bind(client);client.request=async payload=>{for(let attempt=0;;attempt++){try{return await request(payload);}catch(e){const delay=/rate limit: units quota .*retry in ~(\d+)ms/.exec(e.message||'');if(!delay||attempt>=2||Number(delay[1])>30000)throw e;await new Promise(resolve=>setTimeout(resolve,Number(delay[1])+350));}}};}return client;}
async function status(){
 const version=await (await fetch('http://127.0.0.1:'+C.PORT+'/api/deploy-version',{signal:AbortSignal.timeout(5000)})).json();
 if(version.commit!==expected||version.source!=='github-volume')throw Error('active_server_commit_mismatch');
 const pause=pauseState();
 const report={mode,commit:expected,pauseDetails:{reason:pause.reason||null,priorReason:pause.prior_reason??null,unknown:(pause.unknown||[]).map(x=>({hash:x.hash,type:x.type,to:x.to}))},mainnet:C.NETWORK==='mainnet',dryRun:C.DRY_RUN,
  sales:process.env.ESTATE_SALES_ENABLED==='1',accounting:process.env.ESTATE_ACCOUNTING_ENABLED==='1',
  liquidity:process.env.ESTATE_LIQUIDITY_ENABLED==='1',harvest:process.env.ESTATE_XRP_PROFIT_HARVEST_ENABLED==='1',distributions:process.env.ESTATE_DISTRIBUTIONS_ENABLED==='1',
  paused:pause.paused===true||process.env.PAYOUTS_PAUSED==='true',signerMatches:!!C.TREASURY_SEED&&xrpl.Wallet.fromSeed(C.TREASURY_SEED).classicAddress===treasury,
  xamanConfigured:!!C.XUMM_KEY&&!!C.XUMM_SECRET,owners:count('estate_property_ownership'),
  pendingEstateTransactions:count('estate_treasury_transactions'," WHERE state IN ('preparing','submitted','validated','held')"),
  pendingImgPayouts:count('estate_hourly_payouts'," WHERE state IN ('preparing','submitted')"),
  bootstrap:exists('estate_img_scan_bootstrap')?openDb().prepare('SELECT start_ledger_index,start_ledger_hash FROM estate_img_scan_bootstrap WHERE id=1').get()||null:null,
  checkpoint:exists('estate_img_scan_watermarks')?openDb().prepare('SELECT ledger_index,scanned_through_ms FROM estate_img_scan_watermarks WHERE id=1').get()||null:null};
 if(process.env.TOKEN_SECRET){
  const crypto=require('node:crypto'),payload=Buffer.from(JSON.stringify({acct:treasury,exp:Date.now()+30000})).toString('base64url');
  const token=payload+'.'+crypto.createHmac('sha256',process.env.TOKEN_SECRET).update(payload).digest('base64url');
  const result=await fetch('http://127.0.0.1:'+C.PORT+'/api/estates/payouts',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});
  if(!result.ok)throw Error('live_status_http_'+result.status);
  const s=await result.json();report.liveStatus={distributionStatus:s.distributionStatus,distributionsEnabled:s.distributionsEnabled,capitalFundingEnabled:s.capitalFundingEnabled,imgXrpProfitDistributionsEnabled:s.imgXrpProfitDistributionsEnabled,liquidityStatus:s.liquidityStatus};
 }
 return report;
}
async function preflight(){
 const report=await status();if(!report.mainnet||report.dryRun||!report.signerMatches||!report.xamanConfigured||report.pendingEstateTransactions||report.pendingImgPayouts)throw Error('production_prerequisites_not_ready');
 if(C.TREASURY&&C.TREASURY!==treasury)throw Error('shared_treasury_configuration_mismatch');
 const c=await rpc(),head=(await c.request({command:'ledger',ledger_index:'validated'})).result;
 const ledgerHash=head.ledger_hash||head.ledger?.ledger_hash;if(head.validated!==true||!/^[A-Fa-f0-9]{64}$/.test(ledgerHash||''))throw Error('validated_preflight_ledger_required');
 const pools=[];
 for(const [a,b,account] of [[IMG,PLX,POOL],[XRP,IMG,undefined],[XRP,PLX,undefined]]){
  const r=(await c.request({command:'amm_info',asset:a,asset2:b,ledger_hash:ledgerHash})).result;
  if(r.ledger_hash!==ledgerHash)throw Error('preflight_pool_ledger_mismatch');
  const p=inspectPool(r,{asset:a,other:b,poolAccount:account});pools.push(p);
 }
 report.poolsVerified=true;
 const ai=(await c.request({command:'account_info',account:treasury,ledger_hash:ledgerHash})).result;
 if(ai.validated!==true||ai.ledger_hash!==ledgerHash||ai.account_data.Account!==treasury)throw Error('validated_treasury_required');
 for(const a of [IMG,PLX]){
  const info=(await c.request({command:'account_info',account:a.issuer,ledger_hash:ledgerHash})).result;
  const lines=(await c.request({command:'account_lines',account:treasury,peer:a.issuer,ledger_hash:ledgerHash,limit:400})).result;
  const l=lines.lines?.find(l=>l.currency===a.currency&&l.account===a.issuer),flags=info.account_data?.Flags||0;
  if(info.validated!==true||info.ledger_hash!==ledgerHash||(info.account_data.TransferRate||1000000000)!==1000000000||(flags&0x00400000)||lines.validated!==true||lines.ledger_hash!==ledgerHash||!l||l.freeze||l.freeze_peer||((flags&0x00040000)&&l.peer_authorized!==true))throw Error('treasury_'+a.currency+'_trustline_not_ready');
 }
 report.assetTrustlinesReady=true;
 const recent=(await c.request({command:'account_tx',account:treasury,ledger_index_min:-1,ledger_index_max:-1,limit:10,forward:false})).result;
 const verifier=createImgRewardVerifier(c,{treasury,imgIssuer:C.IMG_ISSUER,allowedSources:[SOURCE],rewardPoolAccount:POOL,skipNonImgPayments:true});
 let recognized=null;
 for(const entry of recent.transactions||[]){const t=entry.tx_json||entry.tx||entry;if(entry.validated!==true||t.Account!==SOURCE||t.Destination!==treasury||t.TransactionType!=='Payment')continue;
  const asset=entry.meta?.delivered_amount;if(asset?.currency!=='IMG'||asset.issuer!==C.IMG_ISSUER)continue;
  const h=entry.hash||t.hash,r=await verifier(h);if(!r.ignored){recognized=r.txHash;break;}
 }
 if(!recognized)throw Error('verified_recent_pollux_reward_required');report.polluxReceiptVerified=recognized;
 const pause=pauseState();
 for(const name of ['watch_known.json','watch_state.json']){const file=path.join(root,name);if(fs.existsSync(file))JSON.parse(fs.readFileSync(file,'utf8'));}
 if(pause.paused===true){
  const unknown=pause.unknown||[],knownFile=path.join(root,'watch_known.json');
  const known=fs.existsSync(knownFile)?JSON.parse(fs.readFileSync(knownFile,'utf8')):[];
  const originalAlert=pause.reason==='unexpected_outgoing_tx'||(pause.reason==='estate_activation_verification_failed'&&pause.prior_reason==='unexpected_outgoing_tx');
  const reviewedAlert=originalAlert&&Array.isArray(unknown)&&unknown.length===1&&unknown[0].hash===knownDeposit&&unknown[0].type==='AMMDeposit';
  const activationRollback=pause.reason==='estate_activation_verification_failed'&&pause.prior_reason===null&&Array.isArray(unknown)&&unknown.length===0&&Array.isArray(known)&&known.includes(knownDeposit);
  const reviewedHistory=[["A52BDA33696E7448C487AE61BDD3D63F3634D5669D71062102F5F0BC906F2070",107974545,"AMMDeposit"],["C6426F933049D579614E129CD8B0F730D139F39EF36D65BAA2ABD3DA3B7B634B",107974533,"Payment"],["EC1727E7DD42CF5D0B48997099C886EF575EBC850B1E55CE9467729182B1710E",107974532,"Payment"],["3640D63D1D8C411840DD2F3F6C237D24C9B35E87E4A0D5AB014B81B3532F7466",107974504,"TrustSet"],["E363F5345B1349548BFDA1688C14ED336A389DACB736038E6A8773B3D58956CB",107974494,"Payment"],["DB7EB8BAA5910A0A9F948AAACEE0B2C53DBC86FDE2E68950E62A2F731B37E194",107974493,"Payment"]];
  const historicalAlert=originalAlert&&Array.isArray(unknown)&&unknown.length===reviewedHistory.length&&new Set(unknown.map(x=>x.hash)).size===reviewedHistory.length&&unknown.every(x=>reviewedHistory.some(([h,,type])=>x.hash===h&&x.type===type));
  if(historicalAlert){
   const boundary=report.bootstrap?.start_ledger_index;if(!Number.isSafeInteger(boundary))throw Error('historical_review_boundary_required');
   for(const [hash,index,type] of reviewedHistory){
    const proof=(await c.request({command:'tx',transaction:hash,binary:false})).result,t=proof.tx_json||proof;
    if(proof.validated!==true||proof.meta?.TransactionResult!=='tesSUCCESS'||proof.ledger_index!==index||index>=boundary||t.Account!==treasury||t.TransactionType!==type||(proof.hash||t.hash)!==hash)throw Error('historical_setup_proof_failed');
    if(type==='AMMDeposit'&&!balanceDelta(proof,treasury,pools[0].lp).gt(0))throw Error('historical_lp_mint_required');
    if(type==='TrustSet'&&(t.LimitAmount?.currency!=='PLX'||t.LimitAmount.issuer!==C.PLX_ISSUER))throw Error('historical_plx_line_required');
    if(type==='Payment'&&t.Destination!==treasury){
     const amount=t.DeliverMax||t.Amount;
     if(t.Destination!=='ryouhapPYV5KNHmFUKrjNqsjxhnxvQiVt'||!['8000','3600'].includes(amount)||proof.meta.delivered_amount!==amount)throw Error('historical_xaman_fee_proof_failed');
    }
   }
   report.reviewedHistoricalSetupTransactions=reviewedHistory.map(([hash])=>hash);
  }
  if(!reviewedAlert&&!activationRollback&&!historicalAlert)throw Error('unexpected_treasury_pause_requires_review');
  const r=(await c.request({command:'tx',transaction:knownDeposit,binary:false})).result,t=r.tx_json||r;
  const issues=[t.Asset,t.Asset2];
  if(r.validated!==true||r.meta?.TransactionResult!=='tesSUCCESS'||t.Account!==treasury||t.TransactionType!=='AMMDeposit'||!issues.some(a=>a.currency==='IMG'&&a.issuer===C.IMG_ISSUER)||!issues.some(a=>a.currency==='PLX'&&a.issuer===C.PLX_ISSUER)||!balanceDelta(r,treasury,pools[0].lp).gt(0))throw Error('known_manual_deposit_proof_failed');
  report.pauseReview='known_validated_designated_pool_deposit';
 }else report.pauseReview='not_paused';
 if(process.env.PAYOUTS_PAUSED==='true')throw Error('environment_treasury_pause_requires_review');
 const reserve=(await c.request({command:'server_state'})).result?.state?.validated_ledger;
 if(!reserve||!/^\d+$/.test(String(reserve.reserve_base))||!/^\d+$/.test(String(reserve.reserve_inc)))throw Error('validated_network_reserve_required');
 let newLines=0;for(const p of pools.slice(0,2)){const ls=(await c.request({command:'account_lines',account:treasury,peer:p.account,ledger_hash:ledgerHash,limit:400})).result;
  if(ls.validated!==true||ls.ledger_hash!==ledgerHash)throw Error('lp_inventory_preflight_failed');if(!ls.lines?.some(l=>l.currency===p.lp.currency&&l.account===p.account))newLines++;
 }
 const encumbered=BigInt(req('./server/estate-liquidity-runtime').estateCashReserve(openDb()));
 const available=BigInt(ai.account_data.Balance)-BigInt(reserve.reserve_base)-BigInt(reserve.reserve_inc)*(BigInt(ai.account_data.OwnerCount||0)+BigInt(newLines))-BigInt(process.env.RESERVE_MARGIN_DROPS||500000)-encumbered;
 report.additionalFeeBufferDrops=available.toString();if(available<5000n)throw Error('additional_treasury_fee_funding_required');
 report.ready=true;return report;
}
(async()=>{
 try{
  if(mode==='preflight')console.log(JSON.stringify(await preflight()));
  else if(mode==='status')console.log(JSON.stringify(await status()));
  else if(mode==='bootstrap'){
   await preflight();db?.close();db=null;
   const {spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,[path.join(code,'scripts/estate-bootstrap.cjs')],{cwd:code,encoding:'utf8',timeout:45000});
   if(r.status!==0)throw Error('bootstrap_command_failed');console.log(JSON.stringify({mode,commit:expected,bootstrapInitialized:true}));
  }else if(mode==='unpause'){
   const report=await preflight();
   if(!report.sales||!report.accounting||!report.liquidity||!report.harvest||!report.distributions||!report.bootstrap||!report.checkpoint)throw Error('activation_flags_or_scanner_not_ready');
   db?.close();db=null;
   req('./server/watch').unpause();console.log(JSON.stringify({mode,commit:expected,unpaused:true}));
  }else{
   const prior=pauseState();req('./server/store').save('pause.json',{...prior,paused:true,prior_reason:prior.reason==='estate_activation_verification_failed'?prior.prior_reason:prior.reason||null,reason:'estate_activation_verification_failed',t:Date.now()});console.log(JSON.stringify({mode,commit:expected,paused:true}));
  }
 }finally{db?.close();try{await client?.disconnect();}catch{}}
})().catch(e=>{console.log(JSON.stringify({mode,commit:expected,ready:false,error:e.message}));process.exitCode=1;});
