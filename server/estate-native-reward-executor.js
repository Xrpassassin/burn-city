'use strict';
// Settles new-policy realized XRP profits in the owner's chosen asset. Every
// conversion and payment has a durable intent; only ledger proofs release cash.
const {createEstateTreasuryTransactions}=require('./estate-treasury-transactions');
const {value,buyQuote,sameAmount,inspectPool,roundingTolerance,verifiedTokenCredit,boundedTokenDebit,xrpMovement}=require('./estate-liquidity-ledger');
const integer=s=>{if(typeof s!=='string'||!/^\d+$/.test(s))throw Error('invalid_native_reward_budget');return BigInt(s);};
function createEstateNativeRewardExecutor({db,client,wallet,treasury,imgIssuer,guard,enabled=false,maxFeeDrops=100,slippageBps=300,maxNativePayoutDrops='1000000',maxNativeDailyDrops='10000000',now=Date.now}={}){
 const IMG={currency:'IMG',issuer:imgIssuer},fee=BigInt(maxFeeDrops);
 db.exec(`CREATE TABLE IF NOT EXISTS estate_native_reward_settlements(
 payout_id TEXT PRIMARY KEY,owner TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency IN ('IMG','XRP')),
 cash_drops TEXT NOT NULL,img TEXT NOT NULL DEFAULT '0',state TEXT NOT NULL CHECK(state IN ('converting','funded','paid')));
 CREATE TABLE IF NOT EXISTS estate_native_reward_usage(payout_id TEXT PRIMARY KEY,budget_drops TEXT NOT NULL,created_at INTEGER NOT NULL);`);
 const get=id=>db.prepare('SELECT * FROM estate_native_reward_settlements WHERE payout_id=?').get(id);
 const row=id=>db.prepare('SELECT * FROM estate_xrp_profit_payouts WHERE id=?').get(id);
 const note=(id,message)=>db.prepare('UPDATE estate_xrp_profit_payouts SET note=? WHERE id=?').run(message,id);
 const credit=(owner,n)=>{const old=integer(db.prepare('SELECT amount_drops FROM estate_xrp_profit_credits WHERE owner=?').get(owner)?.amount_drops||'0');db.prepare('INSERT INTO estate_xrp_profit_credits VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET amount_drops=excluded.amount_drops').run(owner,String(old+n));};
 const journal=createEstateTreasuryTransactions({db,client,wallet,treasury,guard,enabled,maxFeeDrops,
  purposeEnabled:p=>enabled&&p.startsWith('native_reward_'),beforeSign:r=>{
   if(!r.purpose.startsWith('native_reward_'))return 'purpose_disabled';
   const s=get(JSON.parse(r.context_json).payoutId);if(!s)return 'native_reward_identity_missing';
   const usage=db.prepare('SELECT * FROM estate_native_reward_usage WHERE payout_id=?').get(s.payout_id);
   if(!usage||integer(usage.budget_drops)>integer(maxNativePayoutDrops))return 'native_profit_payment_budget_limit';
   const day=now()-now()%86400000,used=db.prepare('SELECT budget_drops FROM estate_native_reward_usage WHERE created_at>=?').all(day).reduce((n,r)=>n+integer(r.budget_drops),0n);
   const budget=integer(usage.budget_drops);if(used+(usage.created_at<day?budget:0n)>integer(maxNativeDailyDrops))return 'native_profit_daily_budget_limit';
   if(usage.created_at<day)db.prepare('UPDATE estate_native_reward_usage SET created_at=? WHERE payout_id=?').run(now(),s.payout_id);
   return null;
  }});
 async function preflight(owner,amount='0',acquiring=false){
  if(owner===treasury||owner===imgIssuer)throw Error('self_or_issuer_profit_payout_review');
  const h=(await client.request({command:'ledger',ledger_index:'validated'})).result,hash=h?.ledger_hash||h?.ledger?.ledger_hash,index=Number(h?.ledger_index??h?.ledger?.ledger_index);
  if(h?.validated!==true||!/^[A-Fa-f0-9]{64}$/.test(hash||'')||!Number.isSafeInteger(index))throw Error('validated_ledger_required');
  const a=(await client.request({command:'account_info',account:owner,ledger_hash:hash})).result;
  if(a?.validated!==true||a.ledger_hash!==hash||a.account_data?.Account!==owner||(a.account_data.Flags&0x00020000))throw Error('profit_recipient_unavailable');
  if(value(amount).gt(0)){
   const issuer=(await client.request({command:'account_info',account:imgIssuer,ledger_hash:hash})).result;
   if(issuer?.validated!==true||issuer.ledger_hash!==hash||issuer.account_data?.Account!==imgIssuer||(issuer.account_data.Flags&0x00440000)||(issuer.account_data.TransferRate||1000000000)!==1000000000)throw Error('unsupported_issuer_state');
   for(const account of [owner,treasury]){
    let marker,found;
    for(let i=0;i<10;i++){
     const r=(await client.request({command:'account_lines',account,peer:imgIssuer,ledger_hash:hash,limit:400,...(marker?{marker}:{})})).result;
     if(r?.validated!==true||r.ledger_hash!==hash||!Array.isArray(r.lines))throw Error('validated_trustline_required');
     found=r.lines.find(l=>l.currency==='IMG'&&l.account===imgIssuer)||found;marker=r.marker;if(!marker)break;
    }
    if(marker||!found||found.freeze||found.freeze_peer)throw Error('recipient_img_trustline_unavailable');
    if(account===owner&&value(found.limit).minus(value(found.balance)).lt(value(amount)))throw Error('recipient_img_trustline_unavailable');
    if(account===treasury){if(acquiring&&value(found.limit).minus(value(found.balance)).lt(value(amount)))throw Error('treasury_asset_limit_insufficient');const liabilities=require('./estate-reward-reserves').rewardImgLiabilityUnits(db);let positions=value('0');for(const j of db.prepare('SELECT data_json FROM estate_liquidity_jobs').all()){const d=JSON.parse(j.data_json);positions=positions.plus(d.img||'0').plus(d.residualImg||'0');}if(value(found.balance).minus(positions).times(1000000).lt(liabilities.toString()))throw Error('unfunded_img_liabilities');}
   }
  }
  const seconds=h.ledger?.close_time??h.ledger?.close_time_ripple;if(!Number.isSafeInteger(seconds))throw Error('validated_ledger_time_required');
  return {hash,index,closeMs:(seconds+946684800)*1000};
 }
 function proofs(){
  for(const r of db.prepare("SELECT * FROM estate_treasury_transactions WHERE purpose IN ('native_reward_convert','native_reward_payout') AND state='validated' ORDER BY created_at,id").all())journal.apply(r,(result,ctx,p)=>{
   const s=get(ctx.payoutId),pay=row(ctx.payoutId),draft=JSON.parse(p.draft_json),paidFee=integer(p.fee_drops);
   if(!s||!pay||pay.state!=='queued'||pay.payout_policy!==2||s.owner!==pay.owner||paidFee>fee)throw Error('native_reward_identity_mismatch');
   if(p.purpose==='native_reward_convert'){
    const received=verifiedTokenCredit(result,treasury,IMG,ctx.output),spent=xrpMovement(result,treasury).negated();
    if(s.state!=='converting'||!spent.gt(0)||spent.gt(value(draft.SendMax))||!sameAmount(result.meta.delivered_amount,draft.Amount))throw Error('native_reward_conversion_mismatch');
    const cash=integer(s.cash_drops)-BigInt(spent.toFixed())-paidFee;if(cash<fee)throw Error('native_reward_fee_funding_missing');
    db.prepare("UPDATE estate_native_reward_settlements SET cash_drops=?,img=?,state='funded' WHERE payout_id=?").run(String(cash),received.toFixed(6,1),pay.id);
   }else{
    if(s.state!=='funded'||draft.Destination!==pay.owner)throw Error('native_reward_payment_mismatch');
    let cash=integer(s.cash_drops)-paidFee;if(cash<0n)throw Error('native_reward_budget_underflow');
    if(s.currency==='IMG'){
     if(!sameAmount(result.meta.delivered_amount,draft.Amount)||!xrpMovement(result,treasury).isZero()||boundedTokenDebit(result,treasury,IMG,s.img).minus(value(s.img)).abs().gt(roundingTolerance(result,treasury,IMG)))throw Error('native_img_delivery_mismatch');
     verifiedTokenCredit(result,pay.owner,IMG,s.img);
    }else{
     if(result.meta.delivered_amount!==draft.Amount||!xrpMovement(result,treasury).eq(value(draft.Amount).negated()))throw Error('native_xrp_delivery_mismatch');
     cash-=integer(draft.Amount);
    }
    if(cash<0n)throw Error('native_reward_budget_underflow');
    // Each receipt retained a separate bounded payout fee. Unused allowance,
    // including all of it when fees came from the entitlement, stays owner-owned.
    credit(pay.owner,cash+fee);
    db.prepare("UPDATE estate_native_reward_settlements SET cash_drops='0',img='0',state='paid' WHERE payout_id=?").run(pay.id);
    db.prepare("UPDATE estate_xrp_profit_payouts SET state='confirmed',tx_hash=?,currency=?,delivered=?,note=NULL WHERE id=?").run(p.tx_hash,s.currency,JSON.stringify(result.meta.delivered_amount),pay.id);
   }
  });
  for(const r of db.prepare("SELECT context_json FROM estate_treasury_transactions WHERE purpose IN ('native_reward_convert','native_reward_payout') AND state='held'").all())note(JSON.parse(r.context_json).payoutId,'reward_transaction_review_required');
 }
 async function tick(){
  proofs();
  if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state='submitted'").get()){const r=await journal.tick();proofs();return r;}
  if(!enabled||guard.paused())return {blocked:'disabled'};
  if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state IN ('preparing','validated','held')").get())return {blocked:'treasury_review_or_application_required'};
  for(const pay of db.prepare("SELECT * FROM estate_xrp_profit_payouts WHERE state='queued' AND payout_policy=2 AND carried=0 ORDER BY available_after_ms,id").all()){
   try{
    if(now()<pay.available_after_ms)continue;
    let s=get(pay.id);
    if(!s){
     if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state!='applied'").get())return {blocked:'other_estates_payment_pending'};
     const currency=db.prepare('SELECT currency FROM estate_owner_payout_preferences WHERE acct=?').get(pay.owner)?.currency;
     if(!['IMG','XRP'].includes(currency))throw Error('owner_currency_selection_required');
     const oldCredit=integer(db.prepare('SELECT amount_drops FROM estate_xrp_profit_credits WHERE owner=?').get(pay.owner)?.amount_drops||'0'),budget=integer(pay.amount_drops)+oldCredit;
     if(budget<=2n*fee){db.exec('BEGIN IMMEDIATE');try{if(row(pay.id)?.carried)throw Error('native_reward_carry_conflict');credit(pay.owner,integer(pay.amount_drops)+fee);db.prepare("UPDATE estate_xrp_profit_payouts SET carried=1,note='below_net_reward_minimum_carried' WHERE id=?").run(pay.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}continue;}
     if(budget>integer(maxNativePayoutDrops))throw Error('native_profit_payment_budget_limit');
     const day=now()-now()%86400000,used=db.prepare('SELECT budget_drops FROM estate_native_reward_usage WHERE created_at>=?').all(day).reduce((n,r)=>n+integer(r.budget_drops),0n);
     if(used+budget>integer(maxNativeDailyDrops))throw Error('native_profit_daily_budget_limit');
     const h=await preflight(pay.owner);if(h.closeMs<pay.available_after_ms)continue;let output;
     if(currency==='IMG'){
      const r=(await client.request({command:'amm_info',asset:{currency:'XRP'},asset2:IMG,ledger_hash:h.hash})).result;
      if(r?.ledger_hash!==h.hash)throw Error('unvalidated_conversion_pool');
      output=value(buyQuote(inspectPool(r,{asset:{currency:'XRP'},other:IMG}),String(budget-2n*fee),slippageBps)).toFixed(6,1);
      if(!value(output).gt(0))throw Error('below_net_reward_minimum');await preflight(pay.owner,output,true);
     }
     db.exec('BEGIN IMMEDIATE');try{
      if(get(pay.id)||row(pay.id)?.state!=='queued')throw Error('native_reward_claim_conflict');
      db.prepare('INSERT INTO estate_native_reward_settlements(payout_id,owner,currency,cash_drops,state) VALUES(?,?,?,?,?)').run(pay.id,pay.owner,currency,String(budget),currency==='IMG'?'converting':'funded');
      db.prepare('INSERT INTO estate_native_reward_usage VALUES(?,?,?)').run(pay.id,String(budget),now());
      db.prepare("INSERT INTO estate_xrp_profit_credits VALUES(?,'0') ON CONFLICT(owner) DO UPDATE SET amount_drops='0'").run(pay.owner);
      if(currency==='IMG')journal.ensure(pay.id+':native-convert','native_reward_convert',{Account:treasury,TransactionType:'Payment',Destination:treasury,Amount:{...IMG,value:output},SendMax:String(budget-2n*fee),Flags:0},{payoutId:pay.id,output,quoteLedger:h.index});
      db.exec('COMMIT');
     }catch(e){db.exec('ROLLBACK');throw e;}
     s=get(pay.id);
    }
    if(s.state==='funded'&&!journal.get(pay.id+':native-pay')){
     const h=await preflight(pay.owner,s.currency==='IMG'?s.img:'0');if(h.closeMs<pay.available_after_ms)continue;
     const amount=s.currency==='IMG'?{...IMG,value:s.img}:String(integer(s.cash_drops)-fee);
     journal.ensure(pay.id+':native-pay','native_reward_payout',{Account:treasury,TransactionType:'Payment',Destination:pay.owner,Amount:amount,Flags:0},{payoutId:pay.id});
    }
    note(pay.id,s.state==='converting'?'converting_earned_profit_to_img':'awaiting_net_reward_payment');
    const result=await journal.tick();if(result.blocked)note(pay.id,result.blocked);return result;
   }catch(e){note(pay.id,e.message);}
  }
  return {idle:true};
 }
 return {tick};
}
module.exports={createEstateNativeRewardExecutor};
