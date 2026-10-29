'use strict';
// Operator-invoked read/initialize command. Does not sign, unpause, or activate.
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');
const C=require('../server/config'),{Client}=require('xrpl');
const {createImgHistoricalBootstrap}=require('../server/estate-img-historical-bootstrap');
const {POOL,SOURCE}=require('../server/estate-hourly-runtime');
(async()=>{
 if(C.NETWORK!=='mainnet')throw Error('mainnet_required');
 const file=path.join(C.DATA_DIR,'shop.db');if(!fs.existsSync(file))throw Error('existing_production_database_required');
 const client=new Client(C.XRPL_WSS);await client.connect();let db;
 try{
  const p=(await client.request({command:'amm_info',amm_account:POOL,ledger_index:'validated'})).result;
  const amounts=[p?.amm?.amount,p?.amm?.amount2];
  if(p?.validated!==true||p.amm.account!==POOL||!amounts.some(x=>x?.currency==='IMG'&&x.issuer===C.IMG_ISSUER)||!amounts.some(x=>x?.currency==='PLX'&&x.issuer===C.PLX_ISSUER))throw Error('designated_pool_verification_failed');
  const account=(await client.request({command:'account_info',account:C.ESTATE_TREASURY,ledger_index:'validated'})).result;
  if(account?.validated!==true||account.account_data?.Account!==C.ESTATE_TREASURY)throw Error('treasury_verification_failed');
  const source=(await client.request({command:'account_info',account:SOURCE,ledger_index:'validated'})).result;
  if(source?.validated!==true||source.account_data?.Account!==SOURCE)throw Error('reward_source_verification_failed');
  const head=(await client.request({command:'ledger',ledger_index:'validated'})).result;
  const index=Number(head.ledger_index??head.ledger?.ledger_index),hash=head.ledger_hash||head.ledger?.ledger_hash;
  if(head.validated!==true||!Number.isSafeInteger(index)||!/^[A-Fa-f0-9]{64}$/.test(hash||''))throw Error('validated_start_ledger_required');
  db=new DatabaseSync(file);const bootstrap=createImgHistoricalBootstrap(db);
  if(bootstrap.current()){console.log('Existing immutable bootstrap retained.');return;}
  bootstrap.configure({startLedgerIndex:index,startLedgerHash:hash,treasury:C.ESTATE_TREASURY,imgIssuer:C.IMG_ISSUER,allowedSources:[SOURCE],confirmedOnChain:true});
  console.log(JSON.stringify({initialized:true,startLedgerIndex:index,startLedgerHash:hash,enabled:false}));
 }finally{db?.close();await client.disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
