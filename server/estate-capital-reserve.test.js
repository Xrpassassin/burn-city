'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'estate-principal-'));process.env.DATA_DIR=data;
const guard=require('./guard');const client={request:async q=>q.command==='account_info'?{result:{account_data:{Balance:'10000000',OwnerCount:0}}}:{result:{state:{validated_ledger:{reserve_base:'1000000',reserve_inc:'200000'}}}}};
(async()=>{
 try{
  const base=await guard.spendable(client,'account');guard.setEstateCapitalReserveReader(()=> '3000000');
  assert.equal(await guard.spendable(client,'account'),base-3000000);
  assert.match(await guard.check(client,'account',base-2000000),/would_break_reserve/);
  guard.setEstateCapitalReserveReader(()=>{throw Error('database_unavailable');});
  assert.equal(await guard.check(client,'account',1),'reserve_check_failed');
  guard.setEstateCapitalReserveReader(()=>'-1');assert.equal(await guard.check(client,'account',1),'reserve_check_failed');
  console.log('Estates purchase principal cannot fund unrelated guarded treasury spending; missing reserve evidence blocks spending');
 }finally{guard.setEstateCapitalReserveReader(()=> '0');fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
