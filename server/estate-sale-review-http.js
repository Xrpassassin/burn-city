'use strict';
const {authorizeEstateReview}=require('./estate-sale-review-auth');
// Testable HTTP decision layer. Caller must supply verified Xaman account and
// a constant-time validated admin token. No writes or XRP operations.
function handleEstateReviewRequest({method,path,query,account,adminTokenValid,allowedAccounts,queue,audit}={}){
 if(!authorizeEstateReview({account,adminTokenValid,allowedAccounts}))return {code:403,body:{error:'forbidden'}};
 if(method!=='GET')return {code:405,body:{error:'read_only_review_api'}};
 if(path==='/api/estates/admin/reviews')return {code:200,body:{reviews:queue.list({limit:25}),readOnly:true}};
 if(path==='/api/estates/admin/reviews/detail'){
  const reservationId=String(query?.get('reservationId')||'');
  const review=queue.detail(reservationId);
  if(!review)return {code:404,body:{error:'review_not_found'}};
  const history=audit.history({actor:account,reservationId});
  if(!history.ok)return {code:403,body:{error:'forbidden'}};
  return {code:200,body:{review,audit:history.events,readOnly:true}};
 }
 return {code:404,body:{error:'not_found'}};
}
module.exports={handleEstateReviewRequest};
