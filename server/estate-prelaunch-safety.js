'use strict';
// Central prelaunch decision for private testing; never authorizes a real offering.
function estatePrelaunchDecision({mode='simulation',counselCleared=false,approvedTermsVersion='',termsAccepted=false,liveSalesFlag=false,liveRewardsFlag=false}={}){
 const blockers=[];
 if(mode!=='simulation')blockers.push('production_requires_independent_legal_and_operational_release');
 if(!counselCleared)blockers.push('legal_review_pending');
 if(!approvedTermsVersion)blockers.push('terms_not_approved');
 if(!termsAccepted)blockers.push('terms_not_accepted');
 if(!liveSalesFlag)blockers.push('sales_disabled');
 // Bonuses are a separate authorization, not implied by property ownership.
 if(!liveRewardsFlag)blockers.push('bonuses_disabled');
 return Object.freeze({simulationAllowed:mode==='simulation',purchaseAuthorized:false,bonusAuthorized:false,blockers:Object.freeze(blockers)});
}
module.exports={estatePrelaunchDecision};
