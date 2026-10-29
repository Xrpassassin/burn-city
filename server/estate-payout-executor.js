'use strict';
// Durable outgoing software adapter. Production activation is operator-controlled.
// Never re-sign a submitted or ambiguous payment, including after expiry.
const {splitImgAmount}=require('./estate-img-amount');
const hex=s=>Buffer.from(s).toString('hex').toUpperCase();
const micro=n=>{n=BigInt(n);return (n/1000000n)+'.'+String(n%1000000n).padStart(6,'0');};
const units=s=>s==='0'?0n:BigInt(splitImgAmount(s).units);
const ATOMS=10n**96n,MICRO_ATOMS=10n**90n;
function atoms(value){let negative=value.startsWith('-');const p=splitImgAmount(negative?value.slice(1):value).exact;const [w,f='']=p.split('.');return (BigInt(w)*ATOMS+BigInt(f.padEnd(96,'0')))*(negative?-1n:1n);}
function spentMicro(meta,treasury,issuer){
 let result=0n,found=0;
 for(const item of meta?.AffectedNodes||[]){const n=item.ModifiedNode||item.DeletedNode;if(n?.LedgerEntryType!=='RippleState')continue;
  const f=n.FinalFields,p=n.PreviousFields;if(f?.Balance?.currency!=='IMG'||!p?.Balance)continue;
  const low=f.LowLimit?.issuer,high=f.HighLimit?.issuer;
  if(!((low===treasury&&high===issuer)||(high===treasury&&low===issuer)))continue;
  const before=p.Balance.value==='0'?0n:atoms(p.Balance.value),after=f.Balance.value==='0'?0n:atoms(f.Balance.value);
  result+=(before-after)*(low===treasury?1n:-1n);found++;
 }
 if(found!==1||result<=0n)throw Error('source_debit_proof_required');
 return (result+MICRO_ATOMS-1n)/MICRO_ATOMS;
}
function quoteXrp(amm,budget,issuer,slippageBps=300){
 const amounts=[amm?.amount,amm?.amount2];const x=amounts.find(a=>typeof a==='string'),i=amounts.find(a=>a?.currency==='IMG'&&a.issuer===issuer);
 if(!x||!/^\d+$/.test(x)||!i||!Number.isSafeInteger(amm.trading_fee)||amm.trading_fee<0||amm.trading_fee>1000)throw Error('invalid_img_xrp_pool');
 const parsed=splitImgAmount(i.value),reserve=BigInt(parsed.units)+(parsed.dust!=='0'?1n:0n),n=BigInt(budget),net=100000n-BigInt(amm.trading_fee);
 const out=BigInt(x)*n*net/(reserve*100000n+n*net);
 const minimum=out*BigInt(10000-slippageBps)/10000n;
 if(minimum<1n)throw Error('below_xrp_payment_minimum');return String(minimum);
}
function createEstatePayoutExecutor({db,client,wallet,treasury,imgIssuer,guard,enabled=false,maxImgUnits='100000000',maxDailyImgUnits='1000000000',maxFeeDrops=100,slippageBps=300}={}){
 if(!/^\d+$/.test(maxDailyImgUnits)||BigInt(maxDailyImgUnits)<1n||!/^\d+$/.test(maxImgUnits)||BigInt(maxImgUnits)<1n||!Number.isSafeInteger(maxFeeDrops)||maxFeeDrops<1||maxFeeDrops>1000||!Number.isSafeInteger(slippageBps)||slippageBps<0||slippageBps>1000)throw Error('invalid_executor_limits');
 let busy=false;
 const update=(id,fields)=>{const keys=Object.keys(fields);db.prepare('UPDATE estate_hourly_payouts SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?').run(...keys.map(k=>fields[k]),id);};
 function note(id,reason){update(id,{note:reason,checked_at_ms:Date.now()});return {held:reason};}
 async function lines(account,ledgerHash){let marker;const result=[];for(let p=0;p<10;p++){
  const r=(await client.request({command:'account_lines',account,peer:imgIssuer,ledger_hash:ledgerHash,limit:400,...(marker?{marker}:{})})).result;
  if(r?.validated!==true||r.ledger_hash!==ledgerHash||!Array.isArray(r.lines))throw Error('unvalidated_trustline_state');result.push(...r.lines);marker=r.marker;if(!marker)return result;
 }throw Error('trustline_history_too_large');}
 async function reconcile(row){
  let result;try{result=(await client.request({command:'tx',transaction:row.tx_hash,binary:false})).result;}catch{return note(row.id,'awaiting_transaction_proof');}
  if(result?.validated!==true)return note(row.id,'awaiting_ledger_validation');
  const tx=result.tx_json||result,expected=JSON.parse(row.tx_json),hash=result.hash||tx.hash;
  if(typeof hash!=='string'||hash.toUpperCase()!==row.tx_hash.toUpperCase())return note(row.id,'transaction_hash_mismatch');
  if(result.meta?.TransactionResult!=='tesSUCCESS'){update(row.id,{state:'held',note:'validated_failure:'+result.meta?.TransactionResult});return {held:'validated_failure'};}
  const delivered=result.meta.delivered_amount;
  const amount=tx.Amount??tx.DeliverMax;
  const sameAsset=sameJsonAmount;
  if(tx.TransactionType!=='Payment'||tx.Account!==treasury||tx.Destination!==row.owner||!sameAsset(amount,expected.Amount)||!sameAsset(delivered,expected.Amount)||JSON.stringify(tx.Memos)!==JSON.stringify(expected.Memos))return note(row.id,'unexpected_validated_payment');
  let spent;try{spent=spentMicro(result.meta,treasury,imgIssuer);}catch{return note(row.id,'source_debit_proof_required');}
  if(spent>BigInt(row.img_units)||(row.currency==='IMG'&&spent!==BigInt(row.img_units)))return note(row.id,'source_budget_mismatch');
  const remaining=BigInt(row.img_units)-spent;
  db.exec('BEGIN IMMEDIATE');try{
   const current=db.prepare('SELECT state FROM estate_hourly_payouts WHERE id=?').get(row.id);if(current.state!=='submitted'){db.exec('COMMIT');return {skipped:'already_reconciled'};}
   const credit=db.prepare('SELECT units FROM estate_payout_credits WHERE owner=?').get(row.owner)?.units||'0';
   db.prepare('INSERT INTO estate_payout_credits VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET units=excluded.units').run(row.owner,String(BigInt(credit)+remaining));
   update(row.id,{state:'confirmed',note:null,delivered:JSON.stringify(delivered),spent_img_units:String(spent),remainder_img_units:String(remaining)});db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}return {confirmed:row.id};
 }
 async function tick({reconcileOnly=false}={}){
  if(busy)return {skipped:'busy'};busy=true;
  try{
   const open=db.prepare("SELECT * FROM estate_hourly_payouts WHERE state='submitted' ORDER BY epoch_start_ms LIMIT 1").get();if(open)return await reconcile(open);
   if(!enabled||reconcileOnly)return {skipped:'disabled'};
   if(guard.paused())return {blocked:'payouts_paused'};
   if(db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state='preparing'").get())return {blocked:'interrupted_preparation_review_required'};
   const w=wallet();if(!w||w.classicAddress!==treasury)return {blocked:'treasury_signer_mismatch'};
   const rows=db.prepare("SELECT * FROM estate_hourly_payouts WHERE state='queued' ORDER BY checked_at_ms,epoch_start_ms,owner LIMIT 50").all();
   for(const queued of rows){
    const row=db.prepare('SELECT * FROM estate_hourly_payouts WHERE id=?').get(queued.id);if(row?.state!=='queued')continue;
    if(!row.currency){const choice=db.prepare('SELECT currency FROM estate_owner_payout_preferences WHERE acct=?').get(row.owner)?.currency;if(!choice){note(row.id,'owner_currency_selection_required');continue;}db.prepare("UPDATE estate_hourly_payouts SET currency=? WHERE id=? AND state='queued' AND currency IS NULL").run(choice,row.id);const current=db.prepare('SELECT currency,state FROM estate_hourly_payouts WHERE id=?').get(row.id);if(current.state!=='queued')continue;row.currency=current.currency;}
    if(row.owner===treasury||row.owner===imgIssuer){note(row.id,'self_or_issuer_payment_review');continue;}
    const budget=BigInt(row.img_units);const now=Date.now(),day=now-now%86400000;const daily=db.prepare('SELECT img_units FROM estate_hourly_payouts WHERE submitted_at_ms>=? AND tx_hash IS NOT NULL').all(day).reduce((s,r)=>s+BigInt(r.img_units),0n);if(daily+budget>BigInt(maxDailyImgUnits)){note(row.id,'daily_payment_budget_limit');continue;}if(budget<=0n||budget>BigInt(maxImgUnits)){note(row.id,'payment_budget_limit');continue;}
    try{
     const head=(await client.request({command:'ledger',ledger_index:'validated'})).result;
     const ledgerHash=head?.ledger_hash||head?.ledger?.ledger_hash;if(head?.validated!==true||!/^[A-Fa-f0-9]{64}$/.test(ledgerHash||''))throw Error('validated_ledger_required');
     const issuer=(await client.request({command:'account_info',account:imgIssuer,ledger_hash:ledgerHash})).result;
     if(issuer?.validated!==true||issuer.ledger_hash!==ledgerHash||issuer.account_data?.Account!==imgIssuer)throw Error('unvalidated_issuer_state');
     if((issuer.account_data.TransferRate||1000000000)!==1000000000||(issuer.account_data.Flags&0x00400000))throw Error('issuer_fee_or_global_freeze');
     const dest=(await client.request({command:'account_info',account:row.owner,ledger_hash:ledgerHash})).result;
     if(dest?.validated!==true||dest.ledger_hash!==ledgerHash||dest.account_data?.Account!==row.owner)throw Error('unvalidated_recipient_state');
     if(dest.account_data.Flags&0x00020000)throw Error('destination_tag_required');
     const source=(await lines(treasury,ledgerHash)).find(l=>l.currency==='IMG'&&l.account===imgIssuer);
     const liabilities=db.prepare("SELECT img_units FROM estate_hourly_payouts WHERE state!='confirmed'").all().reduce((s,r)=>s+BigInt(r.img_units),0n)+db.prepare('SELECT units FROM estate_payout_credits').all().reduce((s,r)=>s+BigInt(r.units),0n);
     if(!source||source.freeze||source.freeze_peer||((issuer.account_data.Flags&0x00040000)&&source.peer_authorized!==true)||units(source.balance)<liabilities)throw Error('unfunded_img_liabilities');
     let amount,sendMax;
     if(row.currency==='IMG'){
      const line=(await lines(row.owner,ledgerHash)).find(l=>l.currency==='IMG'&&l.account===imgIssuer);
      if(!line||line.freeze||line.freeze_peer||units(line.limit)-units(line.balance)<budget||((issuer.account_data.Flags&0x00040000)&&line.peer_authorized!==true))throw Error('recipient_img_trustline_unavailable');
      amount={currency:'IMG',issuer:imgIssuer,value:micro(budget)};sendMax={...amount};
     }else{
      const pool=(await client.request({command:'amm_info',asset:{currency:'XRP'},asset2:{currency:'IMG',issuer:imgIssuer},ledger_hash:ledgerHash})).result;
      if(pool?.validated!==true||pool.ledger_hash!==ledgerHash)throw Error('unvalidated_conversion_pool');
      amount=quoteXrp(pool.amm,budget,imgIssuer,slippageBps);sendMax={currency:'IMG',issuer:imgIssuer,value:micro(budget)};
     }
     const draft={TransactionType:'Payment',Account:treasury,Destination:row.owner,Amount:amount,Flags:0,...(sendMax?{SendMax:sendMax}:{}),Memos:[{Memo:{MemoType:hex('burncity/estate-hourly'),MemoData:hex(row.id)}}]};
     const tx=await client.autofill(draft);
     if(JSON.stringify({...tx,Fee:undefined,Sequence:undefined,LastLedgerSequence:undefined,NetworkID:undefined})!==JSON.stringify({...draft,Fee:undefined,Sequence:undefined,LastLedgerSequence:undefined,NetworkID:undefined}))throw Error('autofill_changed_payment');
     if(!/^\d+$/.test(tx.Fee||'')||Number(tx.Fee)>maxFeeDrops||!Number.isSafeInteger(tx.Sequence)||tx.Sequence<1||!Number.isSafeInteger(tx.LastLedgerSequence)||tx.LastLedgerSequence<=Number(head.ledger_index??head.ledger?.ledger_index)||tx.LastLedgerSequence>Number(head.ledger_index??head.ledger?.ledger_index)+30)throw Error('unsafe_transaction_envelope');
     const bad=await guard.check(client,treasury,Number(tx.Fee));if(bad)throw Error(bad);
     if(guard.paused())throw Error('payouts_paused');
     if(db.prepare("UPDATE estate_hourly_payouts SET state='preparing' WHERE id=? AND state='queued' AND NOT EXISTS(SELECT 1 FROM estate_hourly_payouts WHERE state IN ('preparing','submitted'))").run(row.id).changes!==1)throw Error('payout_claim_conflict');
     const signed=w.sign(tx);
     const xrpl=require('xrpl'),decoded=xrpl.decode(signed.tx_blob);
     if(xrpl.hashes.hashSignedTx(signed.tx_blob)!==signed.hash||!xrpl.verifySignature(signed.tx_blob)||decoded.Account!==treasury||decoded.Destination!==row.owner||!sameJsonAmount(decoded.Amount,tx.Amount))throw Error('signed_payment_mismatch');
     update(row.id,{state:'submitted',tx_hash:signed.hash,tx_blob:signed.tx_blob,tx_json:JSON.stringify(tx),note:null,submitted_at_ms:Date.now()});
     // Persist before network access. Unknown outcomes are reconciled by the same
     // hash forever; never automatically sign replacement transactions.
     try{await client.request({command:'submit',tx_blob:signed.tx_blob});}catch{}
     return {submitted:row.id};
    }catch(e){note(row.id,e.message);if(db.prepare('SELECT state FROM estate_hourly_payouts WHERE id=?').get(row.id).state==='preparing')return {blocked:'preparation_needs_review'};}
   }
   return {processed:rows.length};
  }finally{busy=false;}
 }
 return {tick};
}
function sameJsonAmount(a,b){if(typeof a==='string'||typeof b==='string')return a===b;return !!a&&!!b&&a.currency===b.currency&&a.issuer===b.issuer&&splitImgAmount(a.value).exact===splitImgAmount(b.value).exact;}
module.exports={createEstatePayoutExecutor,quoteXrp,spentMicro,micro};
