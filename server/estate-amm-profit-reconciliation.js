'use strict';
// Conservative accounting: no distribution until principal basis, proceeds and
// fees have been independently established in a consistent IMG unit of account.
function nonnegative(v, name) {
 if(typeof v!=='string'||!/^(0|[1-9]\d*)$/.test(v))throw new TypeError(name+'_must_be_unsigned_integer_string');
 return BigInt(v);
}
function reconcileAmmRealizedImg({verifiedImgProceedsUnits,returnedPrincipalImgBasisUnits,verifiedImgCostsUnits,previouslyRecognizedEarningsImgUnits}={}) {
 const proceeds=nonnegative(verifiedImgProceedsUnits,'verifiedImgProceedsUnits');
 const principal=nonnegative(returnedPrincipalImgBasisUnits,'returnedPrincipalImgBasisUnits');
 const costs=nonnegative(verifiedImgCostsUnits,'verifiedImgCostsUnits');
 const previous=nonnegative(previouslyRecognizedEarningsImgUnits,'previouslyRecognizedEarningsImgUnits');
 const deductions=principal+costs;
 const grossProfit=proceeds>deductions?proceeds-deductions:0n;
 const newProfit=grossProfit>previous?grossProfit-previous:0n;
 return Object.freeze({
  verifiedImgProceedsUnits:proceeds.toString(),
  principalAndCostsImgUnits:deductions.toString(),
  cumulativeRealizedProfitImgUnits:grossProfit.toString(),
  additionalCandidateEarningsImgUnits:newProfit.toString(),
  status:'candidate_requires_independent_evidence',
  distributable:false,
  executionEnabled:false
 });
}
module.exports={reconcileAmmRealizedImg};
