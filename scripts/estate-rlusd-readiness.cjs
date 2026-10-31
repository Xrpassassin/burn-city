'use strict';
const {Client}=require('xrpl'),config=require('../server/config');
const {inspectEstateRlusdReadiness}=require('../server/estate-rlusd-readiness');
const client=new Client(config.XRPL_WSS,{connectionTimeout:10000,timeout:10000});
(async()=>{try{await client.connect();const report=await inspectEstateRlusdReadiness({client,treasury:config.ESTATE_TREASURY,imgIssuer:config.IMG_ISSUER,poolAccount:process.argv[2]||process.env.ESTATE_IMG_RLUSD_POOL_ACCOUNT});console.log(JSON.stringify(report,null,2));if(!report.ready)process.exitCode=1;}finally{if(client.isConnected())await client.disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
