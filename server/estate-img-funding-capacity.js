'use strict';
// Accounting reserve only. Funding must be verified externally against validated XRPL
// ledger history before any reward allocation can be approved or paid.
function units(value, field) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) throw new TypeError(field + '_must_be_unsigned_integer_string');
  return BigInt(value);
}
function calculateImgRewardCapacity({ treasuryImgUnits, committedLiquidityImgUnits, pendingWithdrawalsImgUnits, minimumReserveImgUnits, verifiedRealizedEarningsImgUnits, alreadyAllocatedImgUnits } = {}) {
  const balance = units(treasuryImgUnits, 'treasuryImgUnits');
  const committed = units(committedLiquidityImgUnits, 'committedLiquidityImgUnits');
  const pending = units(pendingWithdrawalsImgUnits, 'pendingWithdrawalsImgUnits');
  const reserve = units(minimumReserveImgUnits, 'minimumReserveImgUnits');
  const earnings = units(verifiedRealizedEarningsImgUnits, 'verifiedRealizedEarningsImgUnits');
  const allocated = units(alreadyAllocatedImgUnits, 'alreadyAllocatedImgUnits');
  const liquid = balance > committed + pending + reserve ? balance - committed - pending - reserve : 0n;
  const unallocated = earnings > allocated ? earnings - allocated : 0n;
  const capacity = liquid < unallocated ? liquid : unallocated;
  return Object.freeze({
    capacityImgUnits: capacity.toString(),
    unencumberedTreasuryImgUnits: liquid.toString(),
    unallocatedVerifiedEarningsImgUnits: unallocated.toString(),
    fundingEligible: capacity > 0n,
    verificationStatus: 'requires_validated_ledger_proof',
    executionEnabled: false
  });
}
module.exports = { calculateImgRewardCapacity };
