'use strict';
// Provisional LP inventory cost-basis allocation. All quantities are exact
// nonnegative integer base units. Basis inputs MUST be independently established.
// This calculator never certifies those inputs or distributable profit.
function allocateLpCostBasis(events,{openingLpUnits='0',openingImgBasisUnits='0',openingPlxBasisUnits='0'}={}){
 if(!Array.isArray(events))throw new TypeError('events_required');
 const parse=(value,label)=>{if(typeof value!=='string'||!/^\d+$/.test(value))throw new TypeError(label+'_must_be_unsigned_integer_string');return BigInt(value)};
 let lp=parse(openingLpUnits,'opening_lp'),img=parse(openingImgBasisUnits,'opening_img_basis'),plx=parse(openingPlxBasisUnits,'opening_plx_basis');
 if(lp===0n&&(img!==0n||plx!==0n))throw new Error('opening_basis_without_lp');
 const seen=new Set();let ledger=-1;const allocations=[];
 for(const e of events){
  if(typeof e?.hash!=='string'||!/^[a-fA-F0-9]{64}$/.test(e.hash)||!Number.isSafeInteger(e.ledgerIndex)||e.ledgerIndex<0)throw new Error('invalid_lp_event_identity');
  const hash=e.hash.toUpperCase();if(seen.has(hash))throw new Error('duplicate_lp_event');seen.add(hash);
  if(e.ledgerIndex<ledger)throw new Error('out_of_order_lp_event');ledger=e.ledgerIndex;
  if(e.distributable!==false||e.historicalAmmIdentityVerified!==true||e.balanceDeltasVerified!==true||e.lpTokenDeltaVerified!==true||e.basisSourceVerified!==true)throw new Error('unverified_lp_basis_inputs');
  const qty=parse(e.lpUnits,'lp_units'),i=parse(e.imgBasisUnits,'img_basis'),p=parse(e.plxBasisUnits,'plx_basis');
  if(qty===0n)throw new Error('zero_lp_movement');
  if(e.eventKind==='liquidity_deposit'){
   lp+=qty;img+=i;plx+=p;
   allocations.push({hash,kind:'deposit',lpUnits:qty.toString(),imgBasisUnits:i.toString(),plxBasisUnits:p.toString()});
  }else if(e.eventKind==='liquidity_withdrawal'){
   if(qty>lp)throw new Error('lp_inventory_overdraw');
   // Floor allocation leaves any indivisible residual basis in inventory;
   // final full withdrawal consumes all remaining basis exactly.
   const usedImg=qty===lp?img:img*qty/lp,usedPlx=qty===lp?plx:plx*qty/lp;
   if(i!==usedImg||p!==usedPlx)throw new Error('withdrawal_basis_allocation_mismatch');
   lp-=qty;img-=usedImg;plx-=usedPlx;
   allocations.push({hash,kind:'withdrawal',lpUnits:qty.toString(),returnedImgPrincipalBasisUnits:usedImg.toString(),returnedPlxPrincipalBasisUnits:usedPlx.toString()});
  }else throw new Error('unsupported_lp_event');
 }
 return Object.freeze({remainingLpUnits:lp.toString(),remainingImgBasisUnits:img.toString(),remainingPlxBasisUnits:plx.toString(),allocations,accountingReady:false,realizedProfitVerified:false,distributable:false});
}
module.exports={allocateLpCostBasis};
