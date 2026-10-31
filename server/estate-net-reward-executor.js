'use strict';
// Convert only verified hourly reward inventory. Successful conversion recovers
// its own network fee before any owner payout; no purchase principal is sold.
const {createEstateTreasuryTransactions}=require('./estate-treasury-transactions');
const {quoteXrp,spentMicro,micro}=require('./estate-payout-executor');
const {value,sameAmount,xrpMovement,verifiedTokenCredit}=require('./estate-liquidity-ledger');
const {rewardImgLiabilityUnits}=require('./estate-reward-reserves');
const units=s=>{if(typeof s!=='string'||!/^\d+$/.test(s))throw Error('invalid_reward_units');return BigInt(s);};
function feeConversionUnits(amm,budget,issuer,target,slippageBps){
 let low=1n,high=budget;
 const quote=n=>{try{return BigInt(quoteXrp(amm,n,issuer,slippageBps));}catch(e){if(e.message==='below_xrp_payment_minimum')return 0n;throw e;}};
 if(quote(high)<=target)throw Error('below_net_reward_minimum');
 while(low<high){const mid=(low+high)/2n;if(quote(mid)>=target)high=mid;else low=mid+1n;}
 if(low>=budget)throw Error('below_net_reward_minimum');return low;
}
function createEstateNetRewardExecutor({db,client,wallet,treasury,imgIssuer,guard,enabled=false,maxFeeDrops=100,slippageBps=300,maxImgUnits='100000000',maxDailyImgUnits='1000000000'}={}){
 if(!Number.isSafeInteger(maxFeeDrops)||maxFeeDrops<1||maxFeeDrops>1000||!Number.isSafeInteger(slippageBps)||slippageBps<0||slippageBps>1000||units(maxImgUnits)<1n||units(maxDailyImgUnits)<1n)throw Error('invalid_net_reward_limits');
 const IMG={currency:'IMG',issuer:imgIssuer},feeBudget=BigInt(maxFeeDrops);
 db.exec(`CREATE TABLE IF NOT EXISTS estate_reward_settlements(
 payout_id TEXT PRIMARY KEY,owner TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency IN ('IMG','XRP')),
 budget_img_units TEXT NOT NULL,conversion_cap_units TEXT NOT NULL,converted_img_units TEXT NOT NULL DEFAULT '0',
 cash_drops TEXT NOT NULL,fee_budget_drops TEXT NOT NULL,fee_paid_drops TEXT NOT NULL DEFAULT '0',
 unrecovered_fee_drops TEXT NOT NULL DEFAULT '0',state TEXT NOT NULL CHECK(state IN ('converting','funded','paid','held')));
 CREATE TABLE IF NOT EXISTS estate_reward_xrp_credits(owner TEXT PRIMARY KEY,drops TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_reward_carryovers(payout_id TEXT PRIMARY KEY,units TEXT NOT NULL);`);
 const journal=createEstateTreasuryTransactions({db,client,wallet,treasury,guard,enabled,maxFeeDrops,purposeEnabled:p=>enabled&&p.startsWith('hourly_reward_'),beforeSign:row=>{if(!row.purpose.startsWith('hourly_reward_'))return 'purpose_disabled';const s=settlement(JSON.parse(row.context_json).payoutId);if(!s)return 'net_reward_identity_missing';if(units(s.budget_img_units)>units(maxImgUnits))return 'payment_budget_limit';const day=Date.now()-Date.now()%86400000,{used,counted}=dailyUse(day,s.payout_id);return used+(counted?0n:units(s.budget_img_units))>units(maxDailyImgUnits)?'daily_payment_budget_limit':null;}});
 const settlement=id=>db.prepare('SELECT * FROM estate_reward_settlements WHERE payout_id=?').get(id);
 const payout=id=>db.prepare('SELECT * FROM estate_hourly_payouts WHERE id=?').get(id);
 const note=(id,reason)=>{db.prepare('UPDATE estate_hourly_payouts SET note=?,checked_at_ms=? WHERE id=?').run(reason,Date.now(),id);return {blocked:reason};};
 let busy=false;
 function creditImg(owner,n){const old=units(db.prepare('SELECT units FROM estate_payout_credits WHERE owner=?').get(owner)?.units||'0');db.prepare('INSERT INTO estate_payout_credits VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET units=excluded.units').run(owner,String(old+n));}
 function creditXrp(owner,n){const old=units(db.prepare('SELECT drops FROM estate_reward_xrp_credits WHERE owner=?').get(owner)?.drops||'0');db.prepare('INSERT INTO estate_reward_xrp_credits VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET drops=excluded.drops').run(owner,String(old+n));}
 function carry(row){
  db.exec('BEGIN IMMEDIATE');try{
   if(payout(row.id)?.state!=='queued'||settlement(row.id))throw Error('reward_carry_claim_conflict');
   db.prepare('INSERT INTO estate_reward_carryovers VALUES(?,?)').run(row.id,row.img_units);creditImg(row.owner,units(row.img_units));
   db.prepare("UPDATE estate_hourly_payouts SET state='held',note='below_net_reward_minimum_carried' WHERE id=?").run(row.id);db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {carried:row.id};
 }
 async function preflight(owner,imgNeeded){
  const head=(await client.request({command:'ledger',ledger_index:'validated'})).result,h=head?.ledger_hash||head?.ledger?.ledger_hash,index=Number(head?.ledger_index??head?.ledger?.ledger_index);
  if(head?.validated!==true||!/^[A-Fa-f0-9]{64}$/.test(h||'')||!Number.isSafeInteger(index))throw Error('validated_ledger_required');
  for(const account of [imgIssuer,owner]){
   const r=(await client.request({command:'account_info',account,ledger_hash:h})).result;
   if(r?.validated!==true||r.ledger_hash!==h||r.account_data?.Account!==account)throw Error('validated_reward_account_required');
   if(account===imgIssuer&&((r.account_data.TransferRate||1000000000)!==1000000000||(r.account_data.Flags&0x00400000)))throw Error('issuer_fee_or_global_freeze');
   if(account===owner&&(r.account_data.Flags&0x00020000))throw Error('destination_tag_required');
   if(account===imgIssuer&&(r.account_data.Flags&0x00040000))throw Error('issuer_authorization_review_required');
  }
  async function lines(account){let marker;const all=[];for(let i=0;i<10;i++){
   const r=(await client.request({command:'account_lines',account,peer:imgIssuer,ledger_hash:h,limit:400,...(marker?{marker}:{})})).result;
   if(r?.validated!==true||r.ledger_hash!==h||!Array.isArray(r.lines))throw Error('validated_trustline_required');all.push(...r.lines);marker=r.marker;if(!marker)return all;
  }throw Error('incomplete_trustline_state');}
  let positionImg=value('0');
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_liquidity_jobs'").get())for(const job of db.prepare('SELECT data_json FROM estate_liquidity_jobs').all()){const d=JSON.parse(job.data_json);for(const k of ['img','residualImg']){const n=value(d[k]||'0');if(n.lt(0))throw Error('invalid_position_inventory');positionImg=positionImg.plus(n);}}
  const source=(await lines(treasury)).find(l=>l.currency==='IMG'&&l.account===imgIssuer);
  if(!source||source.freeze||source.freeze_peer||value(source.balance).minus(positionImg).times(1000000).lt(rewardImgLiabilityUnits(db).toString()))throw Error('unfunded_img_liabilities');
  if(imgNeeded){const line=(await lines(owner)).find(l=>l.currency==='IMG'&&l.account===imgIssuer);if(!line||line.freeze||line.freeze_peer||value(line.limit).minus(value(line.balance)).lt(micro(imgNeeded)))throw Error('recipient_img_trustline_unavailable');}
  return {hash:h,index};
 }
 function applyProofs(){
  for(const r of db.prepare("SELECT * FROM estate_treasury_transactions WHERE purpose IN ('hourly_reward_convert','hourly_reward_payout') AND state='validated' ORDER BY created_at,id").all())journal.apply(r,(result,ctx,proof)=>{
   const s=settlement(ctx.payoutId),row=payout(ctx.payoutId),fee=units(proof.fee_drops),draft=JSON.parse(proof.draft_json);
   if(!s||row.state!=='queued'||s.owner!==row.owner||s.currency!==row.currency||s.budget_img_units!==row.img_units||fee>units(s.fee_budget_drops))throw Error('net_reward_identity_or_fee_mismatch');
   if(proof.purpose==='hourly_reward_convert'){
    const spent=spentMicro(result.meta,treasury,imgIssuer);
    if(s.state!=='converting'||spent>units(s.conversion_cap_units)||draft.Destination!==treasury||result.meta.delivered_amount!==ctx.output||!xrpMovement(result,treasury).eq(value(ctx.output))||units(ctx.output)<2n*feeBudget)throw Error('net_reward_conversion_proof_mismatch');
    const cash=units(s.cash_drops)+units(ctx.output)-fee;
    db.prepare("UPDATE estate_reward_settlements SET converted_img_units=?,cash_drops=?,fee_paid_drops=?,state='funded' WHERE payout_id=?").run(String(spent),String(cash),String(fee),row.id);
    note(row.id,'reward_fee_funding_verified');
   }else{
    if(s.state!=='funded'||draft.Destination!==row.owner||!sameAmount(result.meta.delivered_amount,draft.Amount))throw Error('net_reward_delivery_mismatch');
    let spent=units(s.converted_img_units),cash=units(s.cash_drops)-fee;
    if(row.currency==='IMG'){
     const sent=spentMicro(result.meta,treasury,imgIssuer),expected=units(s.budget_img_units)-spent;
     if(sent!==expected||!xrpMovement(result,treasury).isZero())throw Error('net_img_payment_proof_mismatch');
     verifiedTokenCredit(result,row.owner,IMG,micro(sent));spent+=sent;
    }else{
     if(!xrpMovement(result,treasury).eq(value(draft.Amount).negated())||units(draft.Amount)!==units(s.cash_drops)-units(s.fee_budget_drops))throw Error('net_xrp_payment_proof_mismatch');
     cash-=units(draft.Amount);
    }
    if(cash<0n||spent>units(row.img_units))throw Error('reward_budget_underflow');
    creditImg(row.owner,units(row.img_units)-spent);creditXrp(row.owner,cash);
    db.prepare("UPDATE estate_hourly_payouts SET state='confirmed',note=NULL,tx_hash=?,tx_blob=?,tx_json=?,delivered=?,spent_img_units=?,remainder_img_units=?,submitted_at_ms=? WHERE id=? AND state='queued'").run(proof.tx_hash,proof.tx_blob,proof.tx_json,JSON.stringify(result.meta.delivered_amount),String(spent),String(units(row.img_units)-spent),proof.submitted_at,row.id);
    db.prepare("UPDATE estate_reward_settlements SET cash_drops='0',fee_paid_drops=?,state='paid' WHERE payout_id=?").run(String(units(s.fee_paid_drops)+fee),row.id);
   }
  });
  for(const r of db.prepare("SELECT * FROM estate_treasury_transactions WHERE purpose IN ('hourly_reward_convert','hourly_reward_payout') AND state='held'").all()){
   const ctx=JSON.parse(r.context_json),s=settlement(ctx.payoutId);if(!s||s.state==='held')continue;
   // A failed validated transaction may burn its bounded network fee. Record it
   // once, freeze the remaining entitlement and require review, never auto-resign.
   const fee=r.fee_drops?units(r.fee_drops):0n,cash=units(s.cash_drops),covered=cash<fee?cash:fee;
   db.prepare("UPDATE estate_reward_settlements SET state='held',cash_drops=?,fee_paid_drops=?,unrecovered_fee_drops=? WHERE payout_id=?").run(String(cash-covered),String(units(s.fee_paid_drops)+fee),String(fee-covered),s.payout_id);
   note(s.payout_id,'reward_transaction_review_required');
  }
 }
 function dailyUse(day,payoutId){
  const rows=db.prepare('SELECT s.payout_id,s.budget_img_units FROM estate_reward_settlements s JOIN estate_treasury_transactions t ON t.id=s.payout_id||\':reward-pay\' OR t.id=s.payout_id||\':reward-convert\' WHERE t.submitted_at>=? GROUP BY s.payout_id').all(day);
  const legacy=db.prepare('SELECT img_units FROM estate_hourly_payouts WHERE submitted_at_ms>=? AND tx_hash IS NOT NULL AND NOT EXISTS(SELECT 1 FROM estate_reward_settlements s WHERE s.payout_id=estate_hourly_payouts.id)').all(day).reduce((n,r)=>n+units(r.img_units),0n);
  return {used:rows.reduce((n,r)=>n+units(r.budget_img_units),legacy),counted:rows.some(r=>r.payout_id===payoutId)};
 }
 async function plan(row){
  if(row.owner===treasury||row.owner===imgIssuer)throw Error('self_or_issuer_payment_review');
  const budget=units(row.img_units);if(budget<1n||budget>units(maxImgUnits))throw Error('payment_budget_limit');
  const day=Date.now()-Date.now()%86400000;
  if(dailyUse(day,row.id).used+budget>units(maxDailyImgUnits))throw Error('daily_payment_budget_limit');
  const h=await preflight(row.owner,row.currency==='IMG'?budget:0n),credit=units(db.prepare('SELECT drops FROM estate_reward_xrp_credits WHERE owner=?').get(row.owner)?.drops||'0');
  let cap=0n,output;
  if(row.currency==='XRP'||credit<feeBudget){
   const r=(await client.request({command:'amm_info',asset:{currency:'XRP'},asset2:IMG,ledger_hash:h.hash})).result;
   if(r?.validated!==true||r.ledger_hash!==h.hash)throw Error('unvalidated_conversion_pool');
   try{
    if(row.currency==='IMG'){cap=feeConversionUnits(r.amm,budget,imgIssuer,2n*feeBudget,slippageBps);output=String(2n*feeBudget);}
    else{cap=budget;output=quoteXrp(r.amm,budget,imgIssuer,slippageBps);if(units(output)<=2n*feeBudget)throw Error('below_net_reward_minimum');}
   }catch(e){if(['below_xrp_payment_minimum','below_net_reward_minimum'].includes(e.message))return carry(row);throw e;}
  }
  db.exec('BEGIN IMMEDIATE');try{
   const fresh=payout(row.id);if(settlement(row.id)||fresh.state!=='queued'||fresh.currency!==row.currency||fresh.img_units!==row.img_units)throw Error('net_reward_claim_conflict');
   db.prepare('INSERT INTO estate_reward_settlements(payout_id,owner,currency,budget_img_units,conversion_cap_units,cash_drops,fee_budget_drops,state) VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.owner,row.currency,row.img_units,String(cap),String(credit),String(feeBudget),cap?'converting':'funded');
   db.prepare("INSERT INTO estate_reward_xrp_credits VALUES(?,'0') ON CONFLICT(owner) DO UPDATE SET drops='0'").run(row.owner);
   if(cap)journal.ensure(row.id+':reward-convert','hourly_reward_convert',{Account:treasury,TransactionType:'Payment',Destination:treasury,Amount:output,SendMax:{...IMG,value:micro(cap)},Flags:0},{payoutId:row.id,output,quoteLedger:h.index});
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {planned:row.id};
 }
 async function tick({reconcileOnly=false}={}){
  if(busy)return {blocked:'busy'};busy=true;
  try{
   applyProofs();
   if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state='submitted'").get()){const r=await journal.tick();applyProofs();return r;}
   if(!enabled||reconcileOnly)return {blocked:'disabled'};if(guard.paused())return {blocked:'payouts_paused'};
   if(wallet()?.classicAddress!==treasury)return {blocked:'treasury_signer_mismatch'};
   if(db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state IN ('preparing','submitted')").get())return {blocked:'legacy_payment_pending'};
   if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state IN ('preparing','validated','held')").get())return {blocked:'treasury_review_or_application_required'};
   for(const row of db.prepare("SELECT * FROM estate_hourly_payouts WHERE state='queued' ORDER BY EXISTS(SELECT 1 FROM estate_reward_settlements s WHERE s.payout_id=estate_hourly_payouts.id) DESC,checked_at_ms,epoch_start_ms,owner LIMIT 50").all()){
    let s=settlement(row.id);
    try{
     if(!row.currency){const choice=db.prepare('SELECT currency FROM estate_owner_payout_preferences WHERE acct=?').get(row.owner)?.currency;if(!choice){note(row.id,'owner_currency_selection_required');continue;}db.prepare("UPDATE estate_hourly_payouts SET currency=? WHERE id=? AND currency IS NULL").run(choice,row.id);row.currency=choice;}
     if(!s){if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state!='applied'").get())break;await plan(row);s=settlement(row.id);if(!s)continue;}
     if(s.state==='funded'&&!journal.get(row.id+':reward-pay')){
      const remaining=units(row.img_units)-units(s.converted_img_units),cash=units(s.cash_drops);if(cash<feeBudget)throw Error('reward_fee_funding_required');
      await preflight(row.owner,row.currency==='IMG'?remaining:0n);
      const amount=row.currency==='IMG'?{...IMG,value:micro(remaining)}:String(cash-feeBudget);
      if(row.currency==='XRP'&&units(amount)<1n||row.currency==='IMG'&&remaining<1n)throw Error('below_net_reward_minimum');
      journal.ensure(row.id+':reward-pay','hourly_reward_payout',{Account:treasury,TransactionType:'Payment',Destination:row.owner,Amount:amount,Flags:0},{payoutId:row.id});
     }
     const limit=dailyUse(Date.now()-Date.now()%86400000,row.id);if(limit.used+(limit.counted?0n:units(s.budget_img_units))>units(maxDailyImgUnits)){note(row.id,'daily_payment_budget_limit');continue;}
     const conversion=journal.get(row.id+':reward-convert');
     if(s.state==='converting'&&conversion?.state==='queued'&&conversion.note==='quote_expired_review_required'){
      const h=await preflight(row.owner,row.currency==='IMG'?units(row.img_units):0n),r=(await client.request({command:'amm_info',asset:{currency:'XRP'},asset2:IMG,ledger_hash:h.hash})).result;
      if(r?.validated!==true||r.ledger_hash!==h.hash)throw Error('unvalidated_conversion_pool');
      const ctx=JSON.parse(conversion.context_json);
      if(units(quoteXrp(r.amm,units(s.conversion_cap_units),imgIssuer,slippageBps))<units(ctx.output))throw Error('conversion_price_outside_bound');
      // Refresh only the evidence timestamp. The unsigned amount and spend cap
      // remain identical, and any persisted signature makes this update fail.
      db.prepare("UPDATE estate_treasury_transactions SET context_json=?,note=NULL WHERE id=? AND state='queued' AND tx_hash IS NULL AND tx_blob IS NULL AND tx_json IS NULL AND context_json=?").run(JSON.stringify({...ctx,quoteLedger:h.index}),conversion.id,conversion.context_json);
     }
     note(row.id,s.state==='converting'?'funding_reward_network_fees':'awaiting_net_reward_payment');
     const result=await journal.tick();if(result.blocked)note(row.id,result.blocked);return result;
    }catch(e){note(row.id,e.message);}
   }
   return {idle:true};
  }finally{busy=false;}
 }
 return {tick,settlement,journal};
}
module.exports={createEstateNetRewardExecutor,feeConversionUnits};
