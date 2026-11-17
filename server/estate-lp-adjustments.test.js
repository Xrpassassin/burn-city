'use strict';
// Bookkeeping adjustment for an operator LP send: proven on ledger, idempotent, signs nothing.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const A=require('./estate-lp-adjustments');
const V=require('./estate-v4-plan');
const M=require('./estate-plx-migration');
const T='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',PX='r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V',H='EDF5C1A5E0432DF5CC79F7B71B846065E724158CC49E8489F4572E35F77E2144';
const LPC='033956A65724AFF248F7E276BC1F4E1FEAF0E675';
const txs={[H]:{validated:true,ledger_index:108394364,tx_json:{TransactionType:'Payment',Account:T,Destination:PX},meta:{TransactionResult:'tesSUCCESS',delivered_amount:{currency:LPC,issuer:V.IMG_PLX_POOL,value:'1000'}}},
 ['A'.repeat(64)]:{validated:true,ledger_index:1,tx_json:{TransactionType:'Payment',Account:T,Destination:PX},meta:{TransactionResult:'tesSUCCESS',delivered_amount:'1000'}},
 ['B'.repeat(64)]:{validated:true,ledger_index:1,tx_json:{TransactionType:'Payment',Account:PX,Destination:T},meta:{TransactionResult:'tesSUCCESS',delivered_amount:{currency:LPC,issuer:V.IMG_PLX_POOL,value:'5'}}}};
const client={async request(q){
 if(q.command==='tx')return {result:txs[q.transaction]};
 if(q.command==='amm_info')return {result:{amm:{lp_token:{currency:LPC,issuer:V.IMG_PLX_POOL,value:'82945.86'}}}};
 throw Error('unexpected '+q.command);}};
(async()=>{
 const db=new DatabaseSync(':memory:');M.createMigrationLedger(db);
 db.prepare("INSERT INTO estate_plx_migration(id,state,confirm,lp_target,onledger_lp_at_start,tracked_lp_at_start,principal_k_at_start,lp_out,started,updated) VALUES('v1','completed','x','1','1','1','1','71504.13166961453',1,1)").run();
 assert.equal(A.trackedImgPlxLp(db).toFixed(),'71504.13166961453');
 const proof=await A.proveLpSend(client,{hash:H.toLowerCase(),treasury:T});
 assert.equal(proof.lp,'1000');assert.equal(proof.destination,PX);
 await assert.rejects(A.proveLpSend(client,{hash:'A'.repeat(64),treasury:T}),/not_img_plx_lp/);
 await assert.rejects(A.proveLpSend(client,{hash:'B'.repeat(64),treasury:T}),/not_outgoing_treasury_payment/);
 await assert.rejects(A.proveLpSend(client,{hash:'nope',treasury:T}),/tx_hash_required/);
 assert.equal(A.bookLpSend(db,proof,{now:()=>5}).booked,true);
 assert.equal(A.bookLpSend(db,proof,{now:()=>6}).booked,false,'idempotent by tx hash');
 assert.equal(A.trackedImgPlxLp(db).toFixed(),'70504.13166961453');
 assert.equal(A.adjustments(db).length,1);
 console.log('Estates LP adjustments: proven on ledger, idempotent, tracked IMG/PLX LP = migration + v4 + adjustments');
})().catch(e=>{console.error(e);process.exit(1);});
