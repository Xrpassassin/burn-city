'use strict';const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{DatabaseSync}=require('node:sqlite'),req=createRequire('/data/gh/cur/package.json'),C=req('./server/config');
(async()=>{const expected="ca64509d53db6b909046e100cf0b4827ba80bd72",base='http://127.0.0.1:'+C.PORT;
 if(fs.readFileSync('/data/gh/SHA','utf8').trim()!==expected)throw Error('deployed_commit_mismatch');
 const version=await (await fetch(base+'/api/deploy-version')).json();if(version.commit!==expected)throw Error('active_server_mismatch');
 const ownership=await (await fetch(base+'/api/estates/ownership')).json(),status=await (await fetch(base+'/api/estates/status')).json();
 const db=new DatabaseSync(path.join(C.DATA_DIR,'shop.db'),{readOnly:true});db.exec('PRAGMA query_only=ON;PRAGMA busy_timeout=3000');try{
  const purchased=db.prepare("SELECT property_id,acct FROM estate_property_ownership WHERE property_id='trailer-01'").get();if(!purchased)throw Error('known_purchase_missing');
  const visible=ownership.properties?.find(p=>p.propertyId===purchased.property_id);if(visible?.owner!==purchased.acct)throw Error('public_ownership_does_not_match_settlement');
  if(ownership.properties.some(p=>Object.keys(p).some(k=>!['propertyId','owner'].includes(k))))throw Error('unexpected_public_ownership_fields');
  const portfolio=req('./server/estate-portfolio').readEstatePortfolio({db,owner:purchased.acct});if(!portfolio.walletReceived.complete)throw Error('confirmed_wallet_totals_not_available');
  const privacy=await fetch(base+'/api/estates/portfolio');if(privacy.status!==401)throw Error('private_rewards_require_authentication');
  console.log(JSON.stringify({readOnly:true,commit:expected,status,purchasedPropertyOwnerVerified:true,publicOwnershipHasNoEarnings:true,privateRewardsRequireAuthentication:true,confirmedWalletRewardTotalsAvailable:true,privateAmountsNotLogged:true}));
 }finally{db.close();}})().catch(e=>{console.log(JSON.stringify({readOnly:true,error:e.message}));process.exitCode=1;});