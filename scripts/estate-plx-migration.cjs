#!/usr/bin/env node
'use strict';
// One-shot IMG/RLUSD -> IMG/PLX migration (see server/estate-plx-migration.js).
//   Dry run (default; read-only, no signer, no DB writes):
//     node scripts/estate-plx-migration.cjs [--dry-run] [--wss=wss://xrplcluster.com] [--json]
//   Execute (operator-approved only; server shell with /data/shop.db and the treasury secret):
//     ESTATE_PLX_MIGRATION_ENABLED=1 node scripts/estate-plx-migration.cjs --execute --confirm=MIGRATE-<lp>
//   Re-running --execute with the same confirm resumes from the journal; it never re-signs a submitted step.
const path=require('node:path');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([^=]+)(?:=(.*))?$/.exec(a);return m?[m[1],m[2]??true]:[a,true];}));
const xrpl=require('xrpl');
const M=require('../server/estate-plx-migration');
const P=require('../server/estate-monthly-plan');
(async()=>{
 const C=require('../server/config');
 const treasury=C.ESTATE_TREASURY;
 const client=new xrpl.Client(args.wss||C.XRPL_WSS||'wss://xrplcluster.com');await client.connect();
 try{
  const cfg=P.monthlyConfig({...process.env,ESTATE_IMG_RLUSD_POOL_ACCOUNT:P.IMG_RLUSD_POOL});
  const mc=M.migConfig(process.env);
  if(!args.execute){
   const st=await M.readLiveState(client,treasury);
   const plan=M.planMigration(st,cfg,mc);
   if(args.json){console.log(JSON.stringify({treasury,state:st,plan},null,1));return;}
   console.log(`DRY RUN (read-only) treasury ${treasury} ledger ${plan.ledger}`);
   for(const s of plan.steps){const {detail,...rest}=s;console.log(JSON.stringify(rest));}
   console.log('residual',JSON.stringify(plan.residual));
   console.log('kept in IMG/RLUSD',JSON.stringify(plan.keptInImgRlusd));
   console.log('reserve',JSON.stringify(plan.reserve));
   console.log('warnings',JSON.stringify(plan.warnings));
   console.log('confirm token for --execute:',plan.confirm);
   return;
  }
  if(!mc.enabled)throw Error('ESTATE_PLX_MIGRATION_ENABLED=1 required');
  if(typeof args.confirm!=='string')throw Error('--confirm=MIGRATE-<lp> required (run the dry run to get it)');
  if(C.NETWORK!=='mainnet'||C.DRY_RUN!==false)throw Error('mainnet live config required');
  const wallet=xrpl.Wallet.fromSeed(C.TREASURY_SEED);if(wallet.classicAddress!==treasury)throw Error('treasury_signer_mismatch');
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(C.DATA_DIR,'shop.db'));db.exec('PRAGMA busy_timeout=5000');
  const guard=require('../server/guard');
  const {createEstateMonthlyExecutor}=require('../server/estate-monthly-executor');
  const ex=createEstateMonthlyExecutor({db,client:{request:q=>client.request(q),autofill:q=>client.autofill(q)},wallet:()=>wallet,treasury,
   cfg:{...cfg,poolAccount:P.IMG_RLUSD_POOL},enabled:true,paused:()=>guard.paused(),xrpRlusdAsset:{currency:P.RLUSD_HEX,issuer:P.RLUSD_ISSUER},
   xrpImgAsset:{currency:'IMG',issuer:cfg.imgIssuer},log:(k,o)=>guard.log('estate-migration-'+k,o),mig:{...mc,plxIssuer:C.PLX_ISSUER}});
  const r=await ex.runPlxMigration({confirm:args.confirm});
  console.log(JSON.stringify(r,null,1));
  if(!r.ok)process.exitCode=2;
 }finally{await client.disconnect();}
})().catch(e=>{console.error('estate-plx-migration:',e.message);process.exit(1);});
