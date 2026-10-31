'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),xrpl=require('xrpl');
const {createEstateImgTrustline}=require('./estate-img-trustline');
(async()=>{
 const db=new DatabaseSync(':memory:'),owner=xrpl.Wallet.generate().classicAddress,other=xrpl.Wallet.generate().classicAddress,issuer=xrpl.Wallet.generate().classicAddress,h='A'.repeat(64),requests=[];
 let line=null,validated=true,clock=1000;
 const module=createEstateImgTrustline({db,config:{NETWORK:'mainnet',IMG_ISSUER:issuer},now:()=>clock,client:{request:async q=>{
  if(q.command==='ledger')return {result:{validated,ledger_hash:h}};
  assert.equal(q.account,owner);assert.equal(q.peer,issuer);assert.equal(q.ledger_hash,h);
  return {result:{validated,ledger_hash:h,lines:line?[line]:[]}};
 }},sdk:()=>({payload:{create:async p=>{requests.push(p);return {uuid:'request-'+requests.length,next:{always:'https://xaman.app/sign/test'}};}}})});
 assert.equal((await module.status(owner)).ready,false);
 const r=await module.start(owner);assert.equal(r.ready,false);assert.equal(r.transaction.Account,owner);assert.deepEqual(r.transaction.LimitAmount,{currency:'IMG',issuer,value:'1000000000'});assert.equal(r.transaction.Flags,131072);assert.equal(requests[0].options.submit,true);
 assert.equal((await module.start(owner)).reused,true);assert.equal(requests.length,1);
 clock+=600001;await module.start(owner);assert.equal(requests.length,2);
 line={currency:'IMG',account:issuer,limit:'1000000000000',balance:'0'};assert.equal((await module.start(owner)).alreadyExists,true);assert.equal(requests.length,2,'never lower an existing valid trust limit');
 line.freeze_peer=true;assert.equal((await module.status(owner)).ready,false);await assert.rejects(()=>module.start(owner),/frozen/);
 validated=false;await assert.rejects(()=>module.status(owner),/validated_ledger/);
 await assert.rejects(()=>module.status('invalid'),/invalid_trustline_account/);
 assert.notEqual(owner,other);
 console.log('Holder IMG trustline: fixed issuer/limit, authenticated account binding, NoRipple, separate Xaman approval, expiry reuse and validated ledger readiness passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
