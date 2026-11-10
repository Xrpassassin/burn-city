'use strict';
const assert=require('node:assert/strict');
const {purchaseTerms,confirmPurchaseTerms}=require('./estate-purchase-terms-gate');
const env={
 ESTATE_OPERATOR_TERMS_ACCEPTED:'1',
 ESTATE_OPERATOR_ACCEPTANCE_REFERENCE:'counsel-review-id-12345',
 ESTATE_PURCHASE_TERMS_VERSION:'v1.0',
 ESTATE_PURCHASE_TERMS_SHA256:'a'.repeat(64),
 ESTATE_PURCHASE_TERMS_URL:'https://example.com/purchase-terms'
};
const terms=purchaseTerms(env);
assert.deepEqual(terms,{version:'v1.0',digest:'A'.repeat(64),url:'https://example.com/purchase-terms'});
assert.equal(confirmPurchaseTerms({acceptedTerms:true,termsVersion:'v1.0',termsDigest:'a'.repeat(64)},terms),true);
assert.equal(confirmPurchaseTerms({acceptedTerms:false,termsVersion:'v1.0',termsDigest:'a'.repeat(64)},terms),false);
assert.equal(confirmPurchaseTerms({acceptedTerms:true,termsVersion:'v2',termsDigest:'a'.repeat(64)},terms),false);
assert.equal(confirmPurchaseTerms({acceptedTerms:true,termsVersion:'v1.0',termsDigest:'b'.repeat(64)},terms),false);
assert.equal(purchaseTerms({...env,ESTATE_OPERATOR_TERMS_ACCEPTED:'0'}),null);
assert.equal(purchaseTerms({...env,ESTATE_OPERATOR_ACCEPTANCE_REFERENCE:''}),null);
assert.equal(purchaseTerms({...env,ESTATE_PURCHASE_TERMS_URL:'http://example.com/terms'}),null);
assert.equal(purchaseTerms({...env,ESTATE_PURCHASE_TERMS_SHA256:'bad'}),null);
assert.equal(purchaseTerms({...env,ESTATE_PURCHASE_TERMS_VERSION:'bad version'}),null);
console.log('Estates purchase-only legal release and terms acknowledgement checks passed');
