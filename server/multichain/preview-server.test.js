'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createWorldPreviewServer}=require('./preview-server');
test('SOL preview exposes only safe config and health',async()=>{
 const server=createWorldPreviewServer();
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const config=await fetch(base+'/api/world-config');
  const json=await config.json();
  assert.equal(json.chain,'solana');
  assert.equal(json.features.payments,false);
  assert.equal(json.previewOnly,true);
  const health=await fetch(base+'/health');assert.equal(health.status,200);
  for(const p of ['/api/history','/api/nft','/admin/payouts','/data.js','/index.html','/js/nftpick.js']){
    const response=await fetch(base+p);assert.equal(response.status,404,p);
  }
  const method=await fetch(base+'/api/world-config',{method:'POST'});
  assert.equal(method.status,405);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
});
