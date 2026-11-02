'use strict';
// Operator-invoked, read-only publication inspection. Never enables sales.
const {verifyEstatePurchaseTermsPublication}=require('../server/estate-purchase-terms-publication');
verifyEstatePurchaseTermsPublication(process.env).then(result=>{
 console.log('ESTATES_APPROVED_TERMS_PUBLICATION='+JSON.stringify(result));
}).catch(e=>{console.error('ESTATES_APPROVED_TERMS_PUBLICATION_BLOCKED='+e.message);process.exitCode=1;});
