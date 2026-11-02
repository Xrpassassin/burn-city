'use strict';
// Read-only XRPL scanning + append-only candidate evidence and CLOSED-HOUR
// observation. NOT a profit calculator, owner-entitlement store, or signer.
// A "no withdrawal observed" hour is NOT a claim of no accrued AMM fees.
const HOUR=3600000,XRPL_EPOCH_MS=946684800000;
const HASH=/^[A-Fa-f0-9]{64}$/,ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const ISSUES=[
 {currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'},
 {currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'}
];
const utcHour=ms=>Math.floor(ms/HOUR)*HOUR;
const timeFromRipple=s=>{
 if(!Number.isSafeInteger(s)||s<0)throw Error('invalid_validated_ledger_close_time');
 const ms=XRPL_EPOCH_MS+s*1000;
 if(!Number.isSafeInteger(ms))throw Error('invalid_validated_ledger_close_time');
 return ms;
};
function validatedLedger(response,requiredIndex=null){
 const result=response?.result??response;
 const l=result?.ledger??result;
 const index=Number(result?.ledger_index??l?.ledger_index);
 const hash=result?.ledger_hash??l?.ledger_hash??l?.hash;
 const close=l?.close_time;
 if(result?.validated!==true||!Number.isSafeInteger(index)||index<1||
    !HASH.test(hash||'')||(requiredIndex!==null&&index!==requiredIndex))
  throw Error('exact_validated_ledger_required');
 return Object.freeze({ledgerIndex:index,ledgerHash:hash.toUpperCase(),closeTimeMs:timeFromRipple(close)});
}
function isRlusdPoolWithdraw(tx){
 const body=tx?.tx_json??tx?.tx??tx;
 const key=a=>a?.currency+':'+a?.issuer;
 return body?.TransactionType==='AMMWithdraw'&&
  [body.Asset,body.Asset2].map(key).sort().join('|')===
  ISSUES.map(key).sort().join('|');
}
function createEstateRlusdHourScanner({db,client,treasury,maxLedgers=120,maxPages=16,maxHours=72}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function'||
    !client||typeof client.request!=='function'||!ACCOUNT.test(treasury||''))
  throw Error('scanning_configuration_required');
 if(!Number.isSafeInteger(maxLedgers)||maxLedgers<1||maxLedgers>5000||
    !Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100||
    !Number.isSafeInteger(maxHours)||maxHours<1||maxHours>168)
  throw Error('invalid_scanner_budget');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_rlusd_hour_scan_checkpoint(
  id INTEGER PRIMARY KEY CHECK(id=1),ledger_index INTEGER NOT NULL,
  ledger_hash TEXT NOT NULL,close_time_ms INTEGER NOT NULL
 );
 CREATE TABLE IF NOT EXISTS estate_rlusd_withdrawal_candidates(
  tx_hash TEXT PRIMARY KEY,ledger_index INTEGER NOT NULL,
  epoch_start_ms INTEGER NOT NULL,pool_account TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state='basis_review_required')
 );
 CREATE TABLE IF NOT EXISTS estate_rlusd_hour_scan_windows(
  epoch_start_ms INTEGER PRIMARY KEY,closed_at_ledger INTEGER NOT NULL,
  closed_at_ledger_hash TEXT NOT NULL,withdrawal_candidates INTEGER NOT NULL,
  source_status TEXT NOT NULL CHECK(source_status IN
   ('no_withdrawal_observed','withdrawal_needs_cost_basis_review'))
 );`);
 const hasStart=()=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_rlusd_forward_reward_start'").get();
 const start=()=>hasStart()?db.prepare('SELECT * FROM estate_rlusd_forward_reward_start WHERE id=1').get():null;
 const checkpoint=()=>db.prepare('SELECT * FROM estate_rlusd_hour_scan_checkpoint WHERE id=1').get()||null;
 const hours=()=>db.prepare('SELECT * FROM estate_rlusd_hour_scan_windows ORDER BY epoch_start_ms').all();
 const candidates=()=>db.prepare('SELECT * FROM estate_rlusd_withdrawal_candidates ORDER BY ledger_index,tx_hash').all();
 async function request(command){const r=await client.request(command);if(!r?.result)throw Error('xrpl_response_required');return r.result;}
 async function scan(){
  const cfg=start();
  if(!cfg)return Object.freeze({blocked:'immutable_forward_start_required',noPayments:true});
  if(cfg.status!=='staged'||!Number.isSafeInteger(cfg.ledger_index)||
     !HASH.test(cfg.ledger_hash||'')||!ACCOUNT.test(cfg.pool_account||'')||
     !Number.isSafeInteger(cfg.ledger_close_time_ms)||
     !Number.isSafeInteger(cfg.first_eligible_hour_ms)||
     cfg.first_eligible_hour_ms!==utcHour(cfg.ledger_close_time_ms)+HOUR)
   throw Error('invalid_immutable_forward_start');
  const previous=checkpoint();
  if(previous&& (previous.ledger_index<cfg.ledger_index||
     !HASH.test(previous.ledger_hash||'')||
     !Number.isSafeInteger(previous.close_time_ms)||
     previous.close_time_ms<cfg.ledger_close_time_ms))
   throw Error('invalid_durable_scan_checkpoint');
  // Both original forward-start boundary and durable checkpoint are
  // revalidated on-chain, never accepted merely as caller flags.
  const anchor=validatedLedger(await request({command:'ledger',ledger_index:cfg.ledger_index}),cfg.ledger_index);
  if(anchor.ledgerHash!==cfg.ledger_hash.toUpperCase()||
     anchor.closeTimeMs!==cfg.ledger_close_time_ms)
   throw Error('immutable_start_ledger_mismatch');
  const last=previous?.ledger_index??cfg.ledger_index;
  if(previous){
   const check=validatedLedger(await request({command:'ledger',ledger_index:last}),last);
   if(check.ledgerHash!==previous.ledger_hash||
      check.closeTimeMs!==previous.close_time_ms)throw Error('checkpoint_validation_mismatch');
  }
  const head=validatedLedger(await request({command:'ledger',ledger_index:'validated'}));
  const to=Math.min(last+maxLedgers,head.ledgerIndex-2);
  if(to<=last)return Object.freeze({blocked:'no_new_validated_ledger_range',checkpointLedger:last,noPayments:true});
  const end=validatedLedger(await request({command:'ledger',ledger_index:to}),to);
  if(end.closeTimeMs<(previous?.close_time_ms??cfg.ledger_close_time_ms))
   throw Error('nonmonotonic_ledger_clock');
  const firstHour=hours().at(-1)?.epoch_start_ms+HOUR||cfg.first_eligible_hour_ms;
  const endHour=utcHour(end.closeTimeMs)-HOUR;
  const hourCount=endHour>=firstHour?Math.floor((endHour-firstHour)/HOUR)+1:0;
  if(hourCount>maxHours)throw Error('closed_hour_capacity_exceeded_without_checkpoint');
  const from=last+1;
  let marker=null,pages=0;const seenMarkers=new Set(), txs=new Map();
  do{
   if(pages>=maxPages)throw Error('incomplete_validated_account_history');
   const r=await request({command:'account_tx',account:treasury,
    ledger_index_min:from,ledger_index_max:to,forward:true,limit:200,
    ...(marker?{marker}:{})});
   if(!Array.isArray(r.transactions)||Number(r.ledger_index_min)!==from||
      Number(r.ledger_index_max)!==to)throw Error('account_history_range_not_proven');
   for(const e of r.transactions){
    const body=e.tx_json??e.tx??e;
    const hash=e.hash??body?.hash;
    const index=Number(e.ledger_index??body?.ledger_index);
    if(e.validated!==true||!HASH.test(hash||'')||
       !Number.isSafeInteger(index)||index<from||index>to)
     throw Error('unvalidated_or_out_of_window_history');
    if(txs.has(hash.toUpperCase()))throw Error('duplicate_transaction_across_history_pages');
    txs.set(hash.toUpperCase(),{body,index});
   }
   pages++;marker=r.marker??null;
   if(marker){
    const key=JSON.stringify(marker);
    if(seenMarkers.has(key))throw Error('repeated_account_history_cursor');
    seenMarkers.add(key);
   }
  }while(marker);
  const observed=[];
  for(const [hash,{body,index}] of txs){
   if(body.Account!==treasury||!isRlusdPoolWithdraw(body))continue;
   const raw=await request({command:'tx',transaction:hash,binary:false});
   const verified=raw?.tx_json??raw?.tx??raw;
   const verifiedHash=raw?.hash??verified?.hash;
   if(raw.validated!==true||raw.meta?.TransactionResult!=='tesSUCCESS'||
      String(verifiedHash||'').toUpperCase()!==hash||
      Number(raw.ledger_index)!==index||verified.Account!==treasury||
      !isRlusdPoolWithdraw(verified))throw Error('validated_pool_withdrawal_proof_missing');
   const eventTime=timeFromRipple(verified.date??raw.date);
   if(eventTime> end.closeTimeMs||
      eventTime<cfg.ledger_close_time_ms)throw Error('withdrawal_time_outside_verified_range');
   observed.push({hash,index,epoch:utcHour(eventTime)});
  }
  // All scan evidence is assembled first, then atomically inserted with the
  // checkpoint. RPC failures cannot skip an hour or partly record withdrawals.
  db.exec('BEGIN IMMEDIATE');
  try{
   const now=checkpoint();
   if((now?.ledger_index??cfg.ledger_index)!==last||
      (now&&now.ledger_hash!==previous.ledger_hash))
    throw Error('concurrent_scan_checkpoint_changed');
   const insertCandidate=db.prepare("INSERT INTO estate_rlusd_withdrawal_candidates VALUES(?,?,?,?,'basis_review_required')");
   for(const e of observed){
    const old=db.prepare('SELECT * FROM estate_rlusd_withdrawal_candidates WHERE tx_hash=?').get(e.hash);
    if(old)throw Error('duplicate_withdrawal_candidate');
    insertCandidate.run(e.hash,e.index,e.epoch,cfg.pool_account);
   }
   const addHour=db.prepare('INSERT INTO estate_rlusd_hour_scan_windows VALUES(?,?,?,?,?)');
   for(let hour=firstHour;hour<=endHour;hour+=HOUR){
    const count=db.prepare('SELECT COUNT(*) n FROM estate_rlusd_withdrawal_candidates WHERE epoch_start_ms=?').get(hour).n;
    addHour.run(hour,to,end.ledgerHash,count,count?'withdrawal_needs_cost_basis_review':'no_withdrawal_observed');
   }
   db.prepare(`INSERT INTO estate_rlusd_hour_scan_checkpoint(id,ledger_index,ledger_hash,close_time_ms)
    VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET
    ledger_index=excluded.ledger_index,ledger_hash=excluded.ledger_hash,close_time_ms=excluded.close_time_ms`)
    .run(to,end.ledgerHash,end.closeTimeMs);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return Object.freeze({readOnlyXRPL:true,nonpaying:true,
   ledgerFrom:from,ledgerThrough:to,
   verifiedHoursClosed:hourCount,withdrawalCandidatesFound:observed.length,
   checkpointLedger:to,ledgerCloseTimeMs:end.closeTimeMs,
   profitProven:false,payoutsEnabled:false});
 }
 return Object.freeze({scan,checkpoint,hours,candidates});
}
module.exports={createEstateRlusdHourScanner,validatedLedger,timeFromRipple,isRlusdPoolWithdraw};
