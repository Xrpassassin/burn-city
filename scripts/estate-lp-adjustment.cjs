#!/usr/bin/env node
'use strict';
// Book an operator-initiated IMG/PLX LP send from the treasury (bookkeeping only; signs nothing).
//   Dry run (default; read-only ledger + read-only DB):
//     node scripts/estate-lp-adjustment.cjs [--tx=<hash>] [--db=/data/shop.db]
//   Apply (operator-approved): node scripts/estate-lp-adjustment.cjs --apply --confirm=ADJUST-<first 8 of hash>
const path=require('node:path');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--([^=]+)(?:=(.*))?$/.exec(a);return m?[m[1],m[2]??true]:[a,true];}));
const xrpl=require('xrpl');
const A=require('../server/estate-lp-adjustments');
const V=require('../server/estate-v4-plan');
const DEFAULT_TX='EDF5C1A5E0432DF5CC79F7B71B846065E724158CC49E8489F4572E35F77E2144';
(async()=>{
 const C=require('../server/config');const treasury=C.ESTATE_TREASURY;
 const hash=String(args.tx||DEFAULT_TX).toUpperCase();
 const client=new xrpl.Client(args.wss||C.XRPL_WSS||'wss://xrplcluster.com');await client.connect();
 try{
  const proof=await A.proveLpSend(client,{hash,treasury});
  const amm=(await client.request({command:'amm_info',amm_account:V.IMG_PLX_POOL,ledger_index:'validated'})).result.amm;
  const lines=(await client.request({command:'account_lines',account:treasury,peer:V.IMG_PLX_POOL,ledger_index:'validated'})).result.lines||[];
  const onLedger=lines.find(l=>l.currency===amm.lp_token.currency)?.balance||'0';
  const dbPath=args.db||path.join(C.DATA_DIR,'shop.db');
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(dbPath,args.apply?{}:{readOnly:true});
  const already=A.adjustments(db).some(r=>r.tx_hash===hash);
  const before=A.trackedImgPlxLp(db);
  const after=already?before:before.minus(proof.lp);
  const out={mode:args.apply?'apply':'dry-run',tx:hash,ledgerIndex:proof.ledgerIndex,destination:proof.destination,lpSent:proof.lp,
   alreadyBooked:already,trackedBefore:before.toFixed(),trackedAfter:after.toFixed(),onLedgerLp:onLedger,
   matchesLedger:after.minus(onLedger).abs().lt('0.000001'),confirm:'ADJUST-'+hash.slice(0,8)};
  if(!args.apply){console.log(JSON.stringify(out,null,1));return;}
  if(args.confirm!==out.confirm)throw Error('confirm_mismatch (expected '+out.confirm+')');
  const r=A.bookLpSend(db,proof,{reason:args.reason||'operator_pollux_unlock_send'});
  console.log(JSON.stringify({...out,booked:r.booked,trackedNow:A.trackedImgPlxLp(db).toFixed()},null,1));
 }finally{await client.disconnect();}
})().catch(e=>{console.error('estate-lp-adjustment:',e.message);process.exit(1);});
