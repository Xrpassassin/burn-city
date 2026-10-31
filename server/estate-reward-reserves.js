'use strict';
const exists=(db,t)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const integer=s=>{if(typeof s!=='string'||!/^\d+$/.test(s))throw Error('invalid_reward_reserve');return BigInt(s);};
function rewardImgLiabilityUnits(db){
 let native=0n;if(exists(db,'estate_native_reward_settlements'))for(const r of db.prepare("SELECT img FROM estate_native_reward_settlements WHERE state!='paid'").all()){const n=new (require('bignumber.js'))(r.img).times(1000000);if(!n.isInteger()||n.lt(0))throw Error('invalid_native_img_reserve');native+=BigInt(n.toFixed());}
 if(!exists(db,'estate_hourly_payouts'))return native;
 let n=db.prepare("SELECT img_units FROM estate_hourly_payouts WHERE state!='confirmed'").all().reduce((n,r)=>n+integer(r.img_units),0n);
 if(exists(db,'estate_payout_credits'))for(const r of db.prepare('SELECT units FROM estate_payout_credits').all())n+=integer(r.units);
 if(exists(db,'estate_reward_settlements'))for(const r of db.prepare("SELECT s.converted_img_units FROM estate_reward_settlements s JOIN estate_hourly_payouts p ON p.id=s.payout_id WHERE p.state!='confirmed'").all())n-=integer(r.converted_img_units);
 if(exists(db,'estate_reward_carryovers'))for(const r of db.prepare('SELECT units FROM estate_reward_carryovers').all())n-=integer(r.units);
 if(n<0n)throw Error('negative_reward_img_reserve');return n+native;
}
function rewardCashReserve(db){
 let n=0n;
 if(exists(db,'estate_reward_xrp_credits'))for(const r of db.prepare('SELECT drops FROM estate_reward_xrp_credits').all())n+=integer(r.drops);
 if(exists(db,'estate_reward_settlements'))for(const r of db.prepare("SELECT cash_drops,fee_budget_drops,state FROM estate_reward_settlements WHERE state!='paid'").all()){
  const cash=integer(r.cash_drops),allowance=r.state==='funded'?integer(r.fee_budget_drops):0n;
  // Like native profit payouts, only the bounded next network fee is released
  // to the global guard. Owner principal and remaining credits stay encumbered.
  n+=cash>allowance?cash-allowance:0n;
 }
 return n;
}
module.exports={rewardImgLiabilityUnits,rewardCashReserve};
