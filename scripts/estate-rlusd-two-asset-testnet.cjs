'use strict';
// DISPOSABLE public TESTNET XRPL AMMDeposit acceptance proof.
// Creates TWO issuer-controlled throwaway IOUs; neither is mainnet IMG/RLUSD.
// No production secrets, treasury accounts, pool addresses or customer funds.
// Tests the exact tfTwoAsset + Amount + Amount2 + optional LPTokenOut field
// combination used by the currently DISABLED Estates liquidity executor.
const assert=require('node:assert/strict');
const xrpl=require('xrpl');
const {N,value,token,balanceDelta}=require('../server/estate-liquidity-ledger');
const TESTNET='wss://s.altnet.rippletest.net:51233';
if(process.env.TREASURY_SEED||process.env.ESTATE_TREASURY_SEED||
   process.env.XRPL_WSS?.includes('mainnet'))throw Error('production_credentials_not_allowed');
const client=new xrpl.Client(TESTNET,{connectionTimeout:15000,timeout:20000});
async function send(wallet,tx){
 const filled=await client.autofill({Account:wallet.classicAddress,...tx});
 // This must NOT use production credentials or be called on mainnet.
 xrpl.validate(filled);
 const blob=wallet.sign(filled).tx_blob;
 const r=(await client.submitAndWait(blob)).result;
 if(r.validated!==true||r.meta?.TransactionResult!=='tesSUCCESS')
  throw Error('testnet_transaction_failed:'+tx.TransactionType+':'+r.meta?.TransactionResult);
 return r;
}
async function run(){
 await client.connect();
 try{
  const [issuer,maker,depositor]=await Promise.all([
   client.fundWallet(),client.fundWallet(),client.fundWallet()
  ]).then(rs=>rs.map(r=>r.wallet));
  const IMG={currency:'IMG',issuer:issuer.classicAddress};
  // RLU is a disposable TEST token, never Ripple's real RLUSD.
  const RLU={currency:'RLU',issuer:issuer.classicAddress};
  await send(issuer,{TransactionType:'AccountSet',
   SetFlag:xrpl.AccountSetAsfFlags.asfDefaultRipple});
  for(const w of [maker,depositor]){
   for(const issue of [IMG,RLU]){
    await send(w,{TransactionType:'TrustSet',
     LimitAmount:{...issue,value:'1000000'}});
   }
  }
  for(const [wallet,amountImg,amountRlu] of [
   [maker,'2000','20'],[depositor,'1500','15']
  ]){
   await send(issuer,{TransactionType:'Payment',
    Destination:wallet.classicAddress,Amount:{...IMG,value:amountImg}});
   await send(issuer,{TransactionType:'Payment',
    Destination:wallet.classicAddress,Amount:{...RLU,value:amountRlu}});
  }
  await send(maker,{TransactionType:'AMMCreate',
   Amount:{...IMG,value:'1000'},Amount2:{...RLU,value:'10'},TradingFee:300});
  const before=(await client.request({command:'amm_info',
   asset:IMG,asset2:RLU,ledger_index:'validated'})).result;
  assert.equal(before.validated,true);
  const amm=before.amm;
  assert(amm?.account&&amm?.lp_token?.value,'test_pool_and_lp_required');
  const minimumLP=token(value(amm.lp_token.value).times('0.90'));
  const tx={TransactionType:'AMMDeposit',Asset:IMG,Asset2:RLU,
   Amount:{...IMG,value:'1000'},Amount2:{...RLU,value:'10'},
   LPTokenOut:{currency:amm.lp_token.currency,issuer:amm.account,value:minimumLP},
   Flags:0x00100000};
  const receipt=await send(depositor,tx);
  const actualTx=receipt.tx_json||receipt;
  assert.equal(actualTx.Flags,0x00100000);
  assert.deepEqual(actualTx.LPTokenOut,tx.LPTokenOut);
  const debitedImg=balanceDelta(receipt,depositor.classicAddress,IMG).negated();
  const debitedRlu=balanceDelta(receipt,depositor.classicAddress,RLU).negated();
  const minted=balanceDelta(receipt,depositor.classicAddress,
   {currency:amm.lp_token.currency,issuer:amm.account});
  assert(debitedImg.gt(0)&&debitedImg.lte('1000'));
  assert(debitedRlu.gt(0)&&debitedRlu.lte('10'));
  assert(minted.gte(value(minimumLP)),'minimum_lp_protected');
  // Existing reserves were 1000 IMG / 10 RLU. This is ratio maintenance,
  // not a swap: only ledger-validated actual token debits count.
  const ratio=debitedImg.div(debitedRlu);
  assert(ratio.minus(100).abs().lt('0.000001'),'onchain_proportional_ratio_required');
  const after=(await client.request({command:'amm_info',
   asset:IMG,asset2:RLU,ledger_index:'validated'})).result;
  assert.equal(after.amm.account,amm.account);
  assert(value(after.amm.lp_token.value).gt(value(amm.lp_token.value)));
  console.log('ESTATES_TWO_ASSET_TESTNET_PROOF='+JSON.stringify({
   network:'public_testnet',assets:'disposable IMG/RLU mock assets',
   mainnetAssetsUsed:false,validated:receipt.validated,
   transactionHash:receipt.hash,ledgerIndex:receipt.ledger_index,
   fieldCombination:'tfTwoAsset+Amount+Amount2+LPTokenOut',
   imgDebited:debitedImg.toFixed(),rluDebited:debitedRlu.toFixed(),
   lpMinted:minted.toFixed(),minimumLpProtected:true,
   priceRatioPreserved:true,productionSigningEnabled:false}));
 }finally{if(client.isConnected())await client.disconnect();}
}
run().catch(e=>{console.error('ESTATES_TWO_ASSET_TESTNET_FAILED:',e.message);process.exitCode=1});
