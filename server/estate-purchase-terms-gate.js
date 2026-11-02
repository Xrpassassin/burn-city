'use strict';
// Independent purchase-only release gate. Environment flags document an
// operator's signoff; they do NOT prove legal compliance or clear a treasury pause.
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;
const DIGEST=/^[A-Fa-f0-9]{64}$/;
const REF=/^[A-Za-z0-9][A-Za-z0-9._:/-]{7,159}$/;
function purchaseTerms(env={}){
 const version=env.ESTATE_PURCHASE_TERMS_VERSION||'';
 const digest=env.ESTATE_PURCHASE_TERMS_SHA256||'';
 const reference=env.ESTATE_PURCHASE_LEGAL_REFERENCE||'';
 let url=null;
 try{const x=new URL(env.ESTATE_PURCHASE_TERMS_URL||'');
  if(x.protocol==='https:'&&!x.username&&!x.password&&!x.hash)url=x.href;
 }catch{}
 if(env.ESTATE_PURCHASE_LEGAL_SIGNOFF!=='1'||!REF.test(reference)||
  !VERSION.test(version)||!DIGEST.test(digest)||!url)return null;
 return Object.freeze({version,digest:digest.toUpperCase(),url});
}
function confirmPurchaseTerms(input,terms){
 if(!terms)return false;
 return input?.acceptedTerms===true&&
  input.termsVersion===terms.version&&
  typeof input.termsDigest==='string'&&input.termsDigest.toUpperCase()===terms.digest;
}
module.exports={purchaseTerms,confirmPurchaseTerms};
