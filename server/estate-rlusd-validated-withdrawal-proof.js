'use strict';
// Evidentiary bridge ONLY: scanned AMMWithdraw -> validated on-chain LP burn
// and two-sided treasury credit proof. Never converts a withdrawal into profit
// or authorizes any payout, purchase, conversion, credit, or capital release.
const crypto=require('node:crypto');
const {value,balanceDelta,verifiedLpBurn}=require('./estate-liquidity-ledger');
const {isRlusdPoolWithdraw}=require('./estate-rlusd-validated-hour-scanner');
const HASH=/^[A-Fa-f0-9]{64}$/,ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const IMG={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const RLUSD={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
function verifiedWithdrawalEvidence({candidate,receipt,poolInfo,treasury}={}){
 if(!candidate||!HASH.test(candidate.tx_hash||'')||
    !Number.isSafeInteger(candidate.ledger_index)||candidate.ledger_index<1||
    !Number.isSafeInteger(candidate.epoch_start_ms)||
    candidate.epoch_start_ms%3600000!==0||
    !ACCOUNT.test(candidate.pool_account||'')||!ACCOUNT.test(treasury||'')||
    candidate.state!=='basis_review_required')
  throw Error('scanner_candidate_required');
 const tx=receipt?.tx_json??receipt?.tx??receipt;
 const actualHash=receipt?.hash??tx?.hash;
 if(receipt?.validated!==true||receipt?.meta?.TransactionResult!=='tesSUCCESS'||
    !HASH.test(actualHash||'')||
    actualHash.toUpperCase()!==candidate.tx_hash.toUpperCase()||
    Number(receipt.ledger_index)!==candidate.ledger_index||
    tx?.Account!==treasury||!isRlusdPoolWithdraw(tx))
  throw Error('validated_img_rlusd_withdrawal_required');
 const amm=poolInfo?.amm;
 if(poolInfo?.validated!==true||
    Number(poolInfo.ledger_index)!==candidate.ledger_index||
    amm?.account!==candidate.pool_account||
    amm?.lp_token?.issuer!==candidate.pool_account||
    !/^03[A-Fa-f0-9]{38}$/.test(amm?.lp_token?.currency||''))
  throw Error('same_ledger_pool_identity_required');
 const lp=tx?.LPTokenIn;
 if(!lp||lp.issuer!==candidate.pool_account||
    lp.currency!==amm.lp_token.currency||!value(lp.value).gt(0))
  throw Error('exact_pool_lp_burn_required');
 // Metadata must independently show the signed LP was burned and that the
 // treasury actually received BOTH token legs. One-sided or partial
 // withdrawals remain unverified rather than generating synthetic revenue.
 const actualLp=verifiedLpBurn(receipt,treasury,
  {currency:lp.currency,issuer:lp.issuer},lp.value);
 const img=balanceDelta(receipt,treasury,IMG);
 const rlusd=balanceDelta(receipt,treasury,RLUSD);
 if(!img.gt(0)||!rlusd.gt(0))throw Error('positive_two_asset_receipt_required');
 if(!/^(0|[1-9][0-9]*)$/.test(tx.Fee||'')||
    BigInt(tx.Fee)>1000n)throw Error('withdrawal_fee_invalid_or_excessive');
 const proof=Object.freeze({
  txHash:candidate.tx_hash.toUpperCase(),
  ledgerIndex:candidate.ledger_index,
  epochStartMs:candidate.epoch_start_ms,
  poolAccount:candidate.pool_account,
  lpCurrency:lp.currency,lpBurned:actualLp.toFixed(),
  imgCredited:img.toFixed(),rlusdCredited:rlusd.toFixed(),
  networkFeeDrops:tx.Fee,
  state:'basis_review_required',
  imgDisposalVerified:false,rlusdNetProceedsVerified:false,
  principalCostBasisVerified:false,realizedNetProfitVerified:false,
  spendableRewardsAuthorized:false,payoutsEnabled:false
 });
 return proof;
}
function createEstateRlusdWithdrawalProofStore({db,client,treasury,maxBatch=25}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function'||
    !client||typeof client.request!=='function'||!ACCOUNT.test(treasury||'')||
    !Number.isSafeInteger(maxBatch)||maxBatch<1||maxBatch>100)
  throw Error('withdrawal_proof_service_configuration_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_rlusd_withdrawal_proofs(
  tx_hash TEXT PRIMARY KEY,
  ledger_index INTEGER NOT NULL CHECK(ledger_index>0),
  pool_account TEXT NOT NULL,
  proof_sha256 TEXT NOT NULL,
  proof_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state='basis_review_required')
 );
 CREATE TRIGGER IF NOT EXISTS estate_rlusd_withdrawal_proofs_immutable_update
  BEFORE UPDATE ON estate_rlusd_withdrawal_proofs
  BEGIN SELECT RAISE(ABORT,'immutable_withdrawal_proof'); END;
 CREATE TRIGGER IF NOT EXISTS estate_rlusd_withdrawal_proofs_immutable_delete
  BEFORE DELETE ON estate_rlusd_withdrawal_proofs
  BEGIN SELECT RAISE(ABORT,'immutable_withdrawal_proof'); END;`);
 const get=hash=>db.prepare('SELECT * FROM estate_rlusd_withdrawal_proofs WHERE tx_hash=?').get(hash);
 const list=()=>db.prepare('SELECT tx_hash,ledger_index,pool_account,state FROM estate_rlusd_withdrawal_proofs ORDER BY ledger_index,tx_hash').all();
 async function read(q){
  const result=await client.request(q);
  if(!result?.result)throw Error('xrpl_read_unavailable');
  return result.result;
 }
 async function scan(){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_rlusd_withdrawal_candidates'").get()||
     !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_rlusd_hour_scan_windows'").get())
   return Object.freeze({blocked:'closed_hour_scanner_required',nonpaying:true});
  const candidates=db.prepare(`SELECT c.*
   FROM estate_rlusd_withdrawal_candidates c
   JOIN estate_rlusd_hour_scan_windows w ON w.epoch_start_ms=c.epoch_start_ms
   WHERE NOT EXISTS (SELECT 1 FROM estate_rlusd_withdrawal_proofs p WHERE p.tx_hash=c.tx_hash)
   ORDER BY c.ledger_index,c.tx_hash LIMIT ?`).all(maxBatch);
  let added=0;
  for(const c of candidates){
   const [receipt,poolInfo]=await Promise.all([
    read({command:'tx',transaction:c.tx_hash,binary:false}),
    read({command:'amm_info',amm_account:c.pool_account,ledger_index:c.ledger_index})
   ]);
   const proof=verifiedWithdrawalEvidence({candidate:c,receipt,poolInfo,treasury});
   const json=JSON.stringify(proof);
   const sha=crypto.createHash('sha256').update(json).digest('hex');
   db.exec('BEGIN IMMEDIATE');
   try{
    const prior=get(proof.txHash);
    if(prior)throw Error('concurrent_or_duplicate_withdrawal_proof');
    const candidate=db.prepare('SELECT tx_hash,ledger_index,epoch_start_ms,pool_account,state FROM estate_rlusd_withdrawal_candidates WHERE tx_hash=?').get(proof.txHash);
    const closed=db.prepare('SELECT epoch_start_ms FROM estate_rlusd_hour_scan_windows WHERE epoch_start_ms=?').get(proof.epochStartMs);
    if(!candidate||!closed||candidate.ledger_index!==proof.ledgerIndex||
       candidate.pool_account!==proof.poolAccount||
       candidate.epoch_start_ms!==proof.epochStartMs||
       candidate.state!=='basis_review_required')
      throw Error('withdrawal_scanner_evidence_changed');
    db.prepare(`INSERT INTO estate_rlusd_withdrawal_proofs
      (tx_hash,ledger_index,pool_account,proof_sha256,proof_json,state)
      VALUES(?,?,?, ?,?,'basis_review_required')`)
     .run(proof.txHash,proof.ledgerIndex,proof.poolAccount,sha,json);
    db.exec('COMMIT');added++;
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  return Object.freeze({verifiedCandidateCount:added,
   remaining:db.prepare(`SELECT COUNT(*) n FROM estate_rlusd_withdrawal_candidates c
    JOIN estate_rlusd_hour_scan_windows w ON w.epoch_start_ms=c.epoch_start_ms
    WHERE NOT EXISTS (SELECT 1 FROM estate_rlusd_withdrawal_proofs p WHERE p.tx_hash=c.tx_hash)`).get().n,
   reviewOnly:true,realizedProfitProven:false,paymentsEnabled:false});
 }
 return Object.freeze({scan,list,get});
}
module.exports={verifiedWithdrawalEvidence,createEstateRlusdWithdrawalProofStore,IMG,RLUSD};
