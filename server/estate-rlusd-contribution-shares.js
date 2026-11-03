'use strict';
// FUTURE IMG/RLUSD reward allocation preview. Every verified Estate purchase
// increases the owner's contribution weight at its settlement timestamp.
// Purchase XRP is NEVER revenue, profit or automatically invested LP capital.
// This module cannot create entitlements, sign or pay anyone.
const {splitEstateCapital}=require('./estate-capital-allocation');
const {propertyWeight}=require('./estate-economy');
const HASH=/^[A-Fa-f0-9]{64}$/,ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const integer=(s,name)=>{
 if(typeof s!=='string'||!/^(0|[1-9][0-9]*)$/.test(s))throw Error(name+'_invalid_nonnegative_integer');
 return BigInt(s);
};
function contributionSnapshot(db,atMs){
 if(!db||typeof db.prepare!=='function'||!Number.isSafeInteger(atMs)||atMs<1)
  throw Error('settled_contribution_snapshot_required');
 const all=db.prepare(`SELECT o.property_id,o.acct,o.purchase_tx,o.purchase_amount_drops,
  o.share_units,o.purchased_at,
  a.buyer,a.property_id AS capital_property_id,a.purchase_drops,
  a.policy_version,a.img_plx_drops,a.img_xrp_drops,a.img_rlusd_drops,
  a.operating_reserve_drops
  FROM estate_property_ownership o
  LEFT JOIN estate_capital_allocations a ON a.purchase_tx=o.purchase_tx
  WHERE o.purchased_at<=? ORDER BY o.purchase_tx,o.property_id`).all(atMs);
 const seen=new Set(),out=[];
 for(const row of all){
  if(!HASH.test(row.purchase_tx||'')||seen.has(row.purchase_tx)||
     !ACCOUNT.test(row.acct||'')||row.buyer!==row.acct||
     row.capital_property_id!==row.property_id||
     ![1,2].includes(row.policy_version)||
     !Number.isSafeInteger(row.purchased_at)||row.purchased_at>atMs||
     row.share_units!==propertyWeight(row.property_id))
   throw Error('invalid_or_unmatched_settled_purchase');
  const paid=integer(String(row.purchase_amount_drops),'ownership_amount');
  if(paid===0n||paid!==integer(row.purchase_drops,'capital_amount'))
   throw Error('settled_purchase_amount_conflict');
  const split=splitEstateCapital(paid.toString(),row.policy_version);
  for(const key of ['img_plx_drops','img_xrp_drops','img_rlusd_drops','operating_reserve_drops']){
   const expected=split[{
    img_plx_drops:'imgPlxDrops',img_xrp_drops:'imgXrpDrops',
    img_rlusd_drops:'imgRlusdDrops',operating_reserve_drops:'operatingReserveDrops'}[key]]||'0';
   if((row[key]??'0')!==expected)throw Error('capital_policy_split_conflict');
  }
  seen.add(row.purchase_tx);
  out.push(Object.freeze({purchaseTx:row.purchase_tx.toUpperCase(),propertyId:row.property_id,
   owner:row.acct,settledAtMs:row.purchased_at,policyVersion:row.policy_version,
   contributionDrops:paid.toString(),prospectiveEligibilityOnly:true}));
 }
 return Object.freeze(out);
}
// Applies to realized future profits only; historical positions are included
// as property-ownership weights without pretending their PLX cost basis was
// migrated into the current IMG/RLUSD LP. No pre-purchase owner entitlements.
function allocateBySettledContributions({units,contributions}={}){
 const totalAmount=integer(units,'reward_units');
 if(!Array.isArray(contributions))throw Error('contributions_required');
 const byOwner=new Map(),seen=new Set();
 for(const p of contributions){
  if(!p||!HASH.test(p.purchaseTx||'')||seen.has(p.purchaseTx.toUpperCase())||
     !ACCOUNT.test(p.owner||'')||!Number.isSafeInteger(p.settledAtMs))
   throw Error('invalid_contribution');
  seen.add(p.purchaseTx.toUpperCase());
  const amount=integer(p.contributionDrops,'contribution_drops');
  if(!amount)throw Error('zero_contribution_not_eligible');
  byOwner.set(p.owner,(byOwner.get(p.owner)||0n)+amount);
 }
 const total=[...byOwner.values()].reduce((sum,n)=>sum+n,0n);
 if(totalAmount>0n&&!total)throw Error('no_settled_contributors');
 const preliminary=[...byOwner].map(([owner,contributed])=>({
  owner,contributed,units:total?(totalAmount*contributed)/total:0n,
  remainder:total?(totalAmount*contributed)%total:0n
 }));
 const assigned=preliminary.reduce((sum,p)=>sum+p.units,0n);
 let left=totalAmount-assigned;
 const ranked=[...preliminary].sort((a,b)=>a.remainder===b.remainder?
  a.owner.localeCompare(b.owner):a.remainder>b.remainder?-1:1);
 for(let i=0;left>0n;i++,left--)ranked[i].units++;
 return Object.freeze({accountingUnit:'micro_RLUSD',
  realizedProfitUnits:totalAmount.toString(),totalEligibleContributionDrops:total.toString(),
  owners:preliminary.sort((a,b)=>a.owner.localeCompare(b.owner)).map(p=>Object.freeze({
   owner:p.owner,contributionDrops:p.contributed.toString(),shareNumerator:p.contributed.toString(),
   shareDenominator:total.toString(),previewUnits:p.units.toString()
  })),contributionsRecorded:contributions.length,
  fundedLpBasisUnverified:true,allocationIsNonpayingPreview:true,
  originalPurchaseCapitalNotRebooked:true,
  distributionsAuthorized:false});
}
function previewFutureProfitDistribution(db,{realizedAtMs,realizedProfitUnits}={}){
 const shares=contributionSnapshot(db,realizedAtMs);
 return Object.freeze({...allocateBySettledContributions({
  units:realizedProfitUnits,contributions:shares}),realizedAtMs,
  snapshotUsesSettledPurchasesOnly:true});
}
module.exports={contributionSnapshot,allocateBySettledContributions,previewFutureProfitDistribution};
