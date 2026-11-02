'use strict';
// Optional launch preflight: independently hash the exact bytes published at the
// approved terms URL. Not a substitute for legal review, nor a runtime enable.
const {createHash}=require('node:crypto');
const {isIP}=require('node:net');
const {purchaseTerms}=require('./estate-purchase-terms-gate');
async function verifyEstatePurchaseTermsPublication(env,{
 fetcher=fetch,maxBytes=524288,timeoutMs=15000
}={}){
 const terms=purchaseTerms(env);
 if(!terms)throw Error('approved_terms_configuration_required');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>1048576||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<500||timeoutMs>30000)throw Error('invalid_preflight_limits');
 const url=new URL(terms.url);
 if(url.protocol!=='https:'||url.username||url.password||url.port||
  isIP(url.hostname)||url.hostname==='localhost'||url.hostname.endsWith('.local')||
  url.hostname.endsWith('.internal')||url.hostname.endsWith('.test'))
  throw Error('terms_public_https_hostname_required');
 const response=await fetcher(terms.url,{
  method:'GET',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),
  headers:{accept:'text/html, text/plain, application/pdf, application/octet-stream'}
 });
 if(response?.status!==200||response.redirected===true)throw Error('terms_publication_unavailable_or_redirect');
 if(response.url&&response.url!==terms.url)throw Error('terms_url_changed_in_flight');
 const length=response.headers?.get?.('content-length');
 if(length!==null&&length!==undefined&&(/[^0-9]/.test(length)||Number(length)>maxBytes))
  throw Error('terms_publication_size_invalid');
 if(!response.body||typeof response.body.getReader!=='function')throw Error('terms_body_missing');
 const reader=response.body.getReader();
 const sha=createHash('sha256');
 let size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error('terms_body_invalid');
   size+=value.byteLength;
   if(size>maxBytes)throw Error('terms_publication_exceeds_limit');
   sha.update(value);
  }
 }finally{try{reader.releaseLock();}catch{}}
 if(!size)throw Error('terms_document_empty');
 const actual=sha.digest('hex').toUpperCase();
 if(actual!==terms.digest)throw Error('approved_terms_publication_digest_mismatch');
 return Object.freeze({verified:true,readOnly:true,version:terms.version,url:terms.url,
  sha256:actual,byteLength:size,legalClearanceConfirmed:false,
  paymentAuthorization:false});
}
module.exports={verifyEstatePurchaseTermsPublication};
