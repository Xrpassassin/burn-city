'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {CAPABILITIES,validateChainConfig,validateAdapter,createDisabledAdapter}=require('./chain-contract');
const {resolveWorldProfile}=require('./world-profiles');
test('world identities and namespaces remain isolated',()=>{
 const burn=resolveWorldProfile('burn'),sol=resolveWorldProfile('sol');
 assert.equal(burn.chain,'xrpl');assert.equal(sol.chain,'solana');
 assert.notEqual(burn.namespace,sol.namespace);
 assert.notEqual(burn.dataDirectoryKey,sol.dataDirectoryKey);
 assert.equal(sol.enabledFeatures.payments,false);
});
test('unknown worlds and enabled payments fail closed',()=>{
 assert.throws(()=>resolveWorldProfile('unknown'));
 assert.throws(()=>validateChainConfig({chain:'solana',brand:'SOL City',network:'mainnet',paymentsEnabled:true}));
});
test('disabled adapter implements all capabilities but refuses operations',async()=>{
 const adapter=validateAdapter(createDisabledAdapter());
 for(const key of CAPABILITIES) await assert.rejects(adapter[key]());
});
test('missing capability fails adapter validation',()=>{
 assert.throws(()=>validateAdapter({walletAuth:async()=>{}}));
});
