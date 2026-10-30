'use strict';
// Read-only reporting. Allocations are entitlements, never claims that a wallet
// payment happened or that the current share will earn a future fixed amount.
const {allocateProfit}=require('./estate-economy');
const DAY=86400000;
function readEstatePortfolio({db,owner,now=Date.now()}){
 if(!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(owner||'')||!Number.isSafeInteger(now)||now<0)throw Error('invalid_portfolio_request');
 const exists=name=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const totalShareUnits=db.prepare('SELECT COALESCE(SUM(share_units),0) n FROM estate_property_ownership').get().n;
 const owned=db.prepare('SELECT property_id,share_units,purchased_at FROM estate_property_ownership WHERE acct=? ORDER BY property_id').all(owner);
 const rows=new Map(owned.map(p=>[p.property_id,{propertyId:p.property_id,shareUnits:p.share_units,purchasedAt:p.purchased_at,imgAllocated24hUnits:'0',xrpAllocated24hDrops:'0'}]));
 const from=Math.max(0,now-DAY);
 const imgAvailable=exists('estate_img_hourly_allocations')&&exists('estate_img_reward_receipts');
 if(imgAvailable)for(const r of db.prepare(`SELECT a.property_id,a.amount_units FROM estate_img_hourly_allocations a JOIN estate_img_reward_receipts r ON r.tx_hash=a.tx_hash WHERE a.owner=? AND r.verified=1 AND r.received_at_ms>=? AND r.received_at_ms<=?`).all(owner,from,now)){
  const p=rows.get(r.property_id);if(p)p.imgAllocated24hUnits=(BigInt(p.imgAllocated24hUnits)+BigInt(r.amount_units)).toString();
 }
 let xrpAvailable=exists('estate_xrp_profit_receipts')&&exists('estate_xrp_profit_payouts');
 if(xrpAvailable){
  xrpAvailable=db.prepare('PRAGMA table_info(estate_xrp_profit_payouts)').all().some(r=>r.name==='base_amount_drops');
  if(xrpAvailable){
   const input=db.prepare(`SELECT r.source_id,r.distributable_drops,r.realized_at_ms,p.base_amount_drops FROM estate_xrp_profit_receipts r JOIN estate_xrp_profit_payouts p ON p.source_id=r.source_id WHERE p.owner=? AND r.realized_at_ms>=? AND r.realized_at_ms<=? ORDER BY r.realized_at_ms,r.source_id`).all(owner,from,now);
   const historical=db.prepare('SELECT property_id AS propertyId,acct FROM estate_property_ownership WHERE purchased_at<=? ORDER BY property_id');
   for(const r of input){
    const amount=BigInt(r.distributable_drops);
    if(amount>BigInt(Number.MAX_SAFE_INTEGER)||r.base_amount_drops===null){xrpAvailable=false;break;}
    // Reproduce the original property allocation before wallet aggregation.
    // Rolled-forward wallet fee credits must not be double-counted as new profit.
    const allocations=allocateProfit(Number(amount),historical.all(r.realized_at_ms)).filter(p=>p.acct===owner);
    if(allocations.reduce((n,p)=>n+BigInt(p.amountDrops),0n)!==BigInt(r.base_amount_drops)){xrpAvailable=false;break;}
    for(const a of allocations){const p=rows.get(a.propertyId);if(p)p.xrpAllocated24hDrops=(BigInt(p.xrpAllocated24hDrops)+BigInt(a.amountDrops)).toString();}
   }
  }
 }
 // Do not publish a partial reconstruction as a complete historical rate.
 if(!xrpAvailable)for(const p of rows.values())p.xrpAllocated24hDrops=null;
 const checkpoint=exists('estate_img_scan_watermarks')?db.prepare('SELECT scanned_through_ms,ledger_index FROM estate_img_scan_watermarks WHERE id=1').get():null;
 return {asOfMs:now,windowStartMs:from,windowHours:24,totalShareUnits,portfolioShareUnits:owned.reduce((n,p)=>n+p.share_units,0),
  dataThroughMs:checkpoint?.scanned_through_ms||null,scannerCurrent:!!checkpoint&&now-checkpoint.scanned_through_ms<=60000,
  imgHistoryAvailable:imgAvailable,xrpHistoryAvailable:xrpAvailable,
  properties:[...rows.values()].map(p=>({...p,imgAverageHourlyUnits:imgAvailable?(BigInt(p.imgAllocated24hUnits)/24n).toString():null,xrpAverageHourlyDrops:xrpAvailable?(BigInt(p.xrpAllocated24hDrops)/24n).toString():null})),
  basis:'recorded_property_allocations_last_24h',paymentsCombinedByWallet:true,rewardsGuaranteed:false};
}
module.exports={readEstatePortfolio};
