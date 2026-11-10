'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {verifyEstatePurchaseTermsPublication:verify}=require('./estate-purchase-terms-publication');
const body='Versioned virtual-property terms, reviewed and signed off before payment.';
const digest=createHash('sha256').update(body).digest('hex').toUpperCase();
const env={ESTATE_OPERATOR_TERMS_ACCEPTED:'1',
 ESTATE_OPERATOR_ACCEPTANCE_REFERENCE:'counsel-reference-2026',
 ESTATE_PURCHASE_TERMS_VERSION:'v1.0',
 ESTATE_PURCHASE_TERMS_SHA256:digest,
 ESTATE_PURCHASE_TERMS_URL:'https://example.com/estate-terms'};
let requests=0;
const serve=async()=>{requests++;return new Response(body,{status:200,
 headers:{'content-type':'text/plain','content-length':String(Buffer.byteLength(body))}})};
(async()=>{
 const result=await verify(env,{fetcher:serve});
 assert.equal(result.verified,true);assert.equal(result.sha256,digest);
 assert.equal(result.legalClearanceConfirmed,false);
 assert.equal(result.paymentAuthorization,false);
 assert.equal(requests,1);
 await assert.rejects(verify({...env,ESTATE_PURCHASE_TERMS_SHA256:'A'.repeat(64)},{fetcher:serve}),/digest_mismatch/);
 await assert.rejects(verify({...env,ESTATE_OPERATOR_TERMS_ACCEPTED:'0'},{fetcher:serve}),/configuration_required/);
 await assert.rejects(verify({...env,ESTATE_PURCHASE_TERMS_URL:'https://127.0.0.1/terms'},{fetcher:serve}),/public_https_hostname/);
 await assert.rejects(verify({...env,ESTATE_PURCHASE_TERMS_URL:'https://localhost/terms'},{fetcher:serve}),/public_https_hostname/);
 await assert.rejects(verify({...env,ESTATE_PURCHASE_TERMS_URL:'https://example.com:8443/terms'},{fetcher:serve}),/public_https_hostname/);
 await assert.rejects(verify(env,{fetcher:async()=>new Response('',{status:302,headers:{location:'https://example.com/different'}})}),/redirect/);
 await assert.rejects(verify(env,{fetcher:async()=>new Response('',{status:404})}),/unavailable/);
 await assert.rejects(verify(env,{fetcher:async()=>new Response('',{status:200})}),/empty/);
 await assert.rejects(verify(env,{fetcher:async()=>new Response(body.repeat(11000),{status:200})}),/exceeds_limit/);
 await assert.rejects(verify(env,{fetcher:async()=>new Response(body,{headers:{'content-length':'900000'}})}),/size_invalid/);
 console.log('Estate published terms digest, redirect, size and launch opt-in verification passed');
})().catch(e=>{console.error(e);process.exitCode=1});
