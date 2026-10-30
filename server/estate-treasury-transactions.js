'use strict';
const xrpl=require('xrpl'),{sameAmount}=require('./estate-liquidity-ledger');
const hex=s=>Buffer.from(s).toString('hex').toUpperCase();
const canonical=o=>Array.isArray(o)?o.map(canonical):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,canonical(o[k])])):o;
const stable=o=>JSON.stringify(canonical(o));
function createEstateTreasuryTransactions({db,client,wallet,treasury,guard,enabled=false,purposeEnabled=()=>true,maxFeeDrops=100}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_treasury_transactions(
 id TEXT PRIMARY KEY,purpose TEXT NOT NULL,draft_json TEXT NOT NULL,context_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','preparing','submitted','validated','applied','held')),
 tx_hash TEXT UNIQUE,tx_blob TEXT,tx_json TEXT,result_json TEXT,note TEXT,fee_drops TEXT,
 ledger_index INTEGER,close_ms INTEGER,created_at INTEGER NOT NULL,submitted_at INTEGER
 );`);
 const get=id=>db.prepare('SELECT * FROM estate_treasury_transactions WHERE id=?').get(id);
 let busy=false;
 function ensure(id,purpose,draft,context){
  if(typeof id!=='string'||!/^[A-Za-z0-9:_-]{1,200}$/.test(id)||!['capital_buy','capital_deposit','profit_withdraw','profit_convert','xrp_profit_payout'].includes(purpose)||draft.Account!==treasury||!['Payment','AMMDeposit','AMMWithdraw'].includes(draft.TransactionType))throw Error('invalid_treasury_intent');
  const memo=[{Memo:{MemoType:hex('burncity/estate-treasury'),MemoData:hex(id)}}];
  const json=JSON.stringify({...draft,Memos:memo}),ctx=JSON.stringify(context),prior=get(id);
  if(prior){if(prior.purpose!==purpose||prior.draft_json!==json||prior.context_json!==ctx)throw Error('treasury_intent_conflict');return prior;}
  db.prepare("INSERT INTO estate_treasury_transactions(id,purpose,draft_json,context_json,state,created_at) VALUES(?,?,?,?,'queued',?)").run(id,purpose,json,ctx,Date.now());return get(id);
 }
 function block(id,note){db.prepare('UPDATE estate_treasury_transactions SET note=? WHERE id=?').run(note,id);return {blocked:note};}
 async function reconcile(row){
  let r;try{r=(await client.request({command:'tx',transaction:row.tx_hash,binary:false})).result;}catch{return block(row.id,'awaiting_transaction_proof');}
  if(r?.validated!==true)return block(row.id,'awaiting_ledger_validation');
  const raw=r.tx_json||r,t=raw.TransactionType==='Payment'?{...raw,Amount:raw.Amount??raw.DeliverMax}:raw;
  if((r.hash||t.hash)?.toUpperCase()!==row.tx_hash)return block(row.id,'transaction_hash_mismatch');
  const expected=JSON.parse(row.tx_json);
  for(const key of Object.keys(expected)){
   if(['SigningPubKey','TxnSignature'].includes(key))continue;
   const a=t[key],b=expected[key];
   if(['Amount','SendMax','Amount2','LPTokenIn','LPTokenOut'].includes(key)?!sameAmount(a,b):typeof b==='object'?stable(a)!==stable(b):a!==b)return block(row.id,'validated_envelope_mismatch');
  }
  if(r.meta?.TransactionResult!=='tesSUCCESS'){
   db.prepare("UPDATE estate_treasury_transactions SET state='held',note=? WHERE id=?").run('validated_failure:'+r.meta?.TransactionResult,row.id);return {blocked:'validated_failure'};
  }
  const date=r.date??t.date,index=r.ledger_index;
  if(!Number.isSafeInteger(index)||!Number.isSafeInteger(date))return block(row.id,'ledger_time_proof_required');
  db.prepare("UPDATE estate_treasury_transactions SET state='validated',result_json=?,fee_drops=?,ledger_index=?,close_ms=?,note=NULL WHERE id=? AND state='submitted'").run(JSON.stringify(r),t.Fee,index,(date+946684800)*1000,row.id);
  return {validated:row.id};
 }
 async function tick(){
  if(busy)return {blocked:'busy'};busy=true;
  try{
   const pending=db.prepare("SELECT * FROM estate_treasury_transactions WHERE state='submitted' ORDER BY created_at,id LIMIT 1").get();if(pending)return await reconcile(pending);
   if(!enabled||guard.paused())return {blocked:!enabled?'disabled':'treasury_paused'};
   if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state IN ('preparing','validated','held')").get())return {blocked:'treasury_review_or_application_required'};
   if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_hourly_payouts'").get()&&db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state IN ('preparing','submitted')").get())return {blocked:'other_estates_payment_pending'};
   const row=db.prepare("SELECT * FROM estate_treasury_transactions WHERE state='queued' ORDER BY created_at,id LIMIT 1").get();if(!row)return {idle:true};
   if(!purposeEnabled(row.purpose))return block(row.id,'purpose_disabled');
   const w=wallet();if(w?.classicAddress!==treasury)return block(row.id,'treasury_signer_mismatch');
   const head=(await client.request({command:'ledger',ledger_index:'validated'})).result;
   const index=Number(head?.ledger_index??head?.ledger?.ledger_index);if(head?.validated!==true||!Number.isSafeInteger(index))throw Error('validated_ledger_required');
   const context=JSON.parse(row.context_json);
   if(context.quoteLedger!==undefined&&(!Number.isSafeInteger(context.quoteLedger)||index<context.quoteLedger||index>context.quoteLedger+10))return block(row.id,'quote_expired_review_required');
   const draft=JSON.parse(row.draft_json),tx=await client.autofill(draft);
   const supplied={...tx};for(const key of ['Fee','Sequence','LastLedgerSequence','NetworkID'])delete supplied[key];
   if(stable(supplied)!==stable(draft))throw Error('autofill_changed_treasury_intent');
   if(!/^\d+$/.test(tx.Fee||'')||BigInt(tx.Fee)>BigInt(maxFeeDrops)||!Number.isSafeInteger(tx.Sequence)||tx.Sequence<1||!Number.isSafeInteger(tx.LastLedgerSequence)||tx.LastLedgerSequence<=index||tx.LastLedgerSequence>index+30)throw Error('unsafe_transaction_envelope');
   // Each principal/reward amount is already encumbered by its owning ledger.
   // The fee must be covered by additional unencumbered treasury XRP.
   const bad=await guard.check(client,treasury,Number(tx.Fee));if(bad)return block(row.id,bad);
   if(guard.paused())return block(row.id,'treasury_paused');
   const otherPending=db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_hourly_payouts'").get()?" AND NOT EXISTS(SELECT 1 FROM estate_hourly_payouts WHERE state IN ('preparing','submitted'))":'';
   if(db.prepare("UPDATE estate_treasury_transactions SET state='preparing',note=NULL WHERE id=? AND state='queued' AND NOT EXISTS(SELECT 1 FROM estate_treasury_transactions WHERE state IN ('preparing','submitted','validated','held'))"+otherPending).run(row.id).changes!==1)return {blocked:'treasury_claim_conflict'};
   const signed=w.sign(tx),decoded=xrpl.decode(signed.tx_blob);
   if(xrpl.hashes.hashSignedTx(signed.tx_blob)!==signed.hash||!xrpl.verifySignature(signed.tx_blob)||decoded.Account!==treasury)throw Error('signed_treasury_intent_mismatch');
   for(const k of Object.keys(draft))if(['Amount','Amount2','SendMax','LPTokenIn','LPTokenOut'].includes(k)?!sameAmount(decoded[k],draft[k]):stable(decoded[k])!==stable(draft[k]))throw Error('signed_treasury_envelope_mismatch');
   db.prepare("UPDATE estate_treasury_transactions SET state='submitted',tx_hash=?,tx_blob=?,tx_json=?,submitted_at=? WHERE id=? AND state='preparing'").run(signed.hash,signed.tx_blob,JSON.stringify(tx),Date.now(),row.id);
   try{await client.request({command:'submit',tx_blob:signed.tx_blob});}catch{}
   return {submitted:row.id};
  }finally{busy=false;}
 }
 function apply(row,fn){
  db.exec('BEGIN IMMEDIATE');try{
   const fresh=get(row.id);if(fresh?.state!=='validated'){db.exec('COMMIT');return false;}
   fn(JSON.parse(fresh.result_json),JSON.parse(fresh.context_json),fresh);
   db.prepare("UPDATE estate_treasury_transactions SET state='applied' WHERE id=? AND state='validated'").run(row.id);db.exec('COMMIT');return true;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return {ensure,get,tick,apply};
}
module.exports={createEstateTreasuryTransactions};
