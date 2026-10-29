'use strict';
// Pure authorization decision used by the HTTP review routes.
// Both factors are mandatory; no reservation lookup is used as an auth probe.
function authorizeEstateReview({account,adminTokenValid,allowedAccounts}={}){
 if(!adminTokenValid||typeof account!=='string'||!account)return false;
 return allowedAccounts instanceof Set&&allowedAccounts.has(account);
}
function parseEstateReviewAdminAccounts(value=''){
 if(typeof value!=='string')throw new TypeError('invalid_admin_accounts');
 const entries=value.split(',').map(x=>x.trim()).filter(Boolean);
 if(entries.some(a=>!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)))throw new TypeError('invalid_admin_accounts');
 return new Set(entries);
}
module.exports={authorizeEstateReview,parseEstateReviewAdminAccounts};
