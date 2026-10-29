'use strict';
// Read-only reward accounting: caller must first independently validate XRPL payment,
// issuer, destination, delivered_amount, and eligible Pollux source. Never signs or pays.
const {propertyWeight}=require('./estate-economy');
const HASH=/^[A-F0-9]{64}$/;
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const SCALE=1000000n; // 6 decimal places, smaller fractions explicitly rejected
function units(value){
 if(typeof value!=='string'|| !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))throw new TypeError('invalid_img_amount');
 const [whole,decimal='']=value.split('.');
 const n=BigInt(whole)*SCALE+BigInt(decimal.padEnd(6,'0'));
 if(n<=0n)throw new TypeError('img_amount_must_be_positive');
 return n;
}
function init(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_img_reward_receipts(
 tx_hash TEXT PRIMARY KEY, ledger_index INTEGER NOT NULL, source TEXT NOT NULL,
 destination TEXT NOT NULL, img_issuer TEXT NOT NULL, amount_units TEXT NOT NULL,
 received_at_ms INTEGER NOT NULL, epoch_start_ms INTEGER NOT NULL,
 verified INTEGER NOT NULL CHECK(verified=1)
 );
 CREATE TABLE IF NOT EXISTS estate_img_hourly_allocations(
 epoch_start_ms INTEGER NOT NULL, tx_hash TEXT NOT NULL,
 property_id TEXT NOT NULL, owner TEXT NOT NULL, amount_units TEXT NOT NULL,
 PRIMARY KEY(epoch_start_ms,tx_hash,property_id),
 FOREIGN KEY(tx_hash) REFERENCES estate_img_reward_receipts(tx_hash)
 );`);
}
function epoch(ms){if(!Number.isSafeInteger(ms)||ms<0)throw new TypeError('invalid_timestamp');return Math.floor(ms/3600000)*3600000;}
function createImgHourlyRewardLedger(db,{treasury,imgIssuer,allowedSources}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_required');
 if(!ACCOUNT.test(treasury||'')||!ACCOUNT.test(imgIssuer||'')||!Array.isArray(allowedSources)||!allowedSources.length||allowedSources.some(x=>!ACCOUNT.test(x)))throw new TypeError('verified_configuration_required');
 const sources=new Set(allowedSources);
 init(db);
 const insert=db.prepare('INSERT INTO estate_img_reward_receipts(tx_hash,ledger_index,source,destination,img_issuer,amount_units,received_at_ms,epoch_start_ms,verified) VALUES(?,?,?,?,?,?,?,?,1)');
 const find=db.prepare('SELECT * FROM estate_img_reward_receipts WHERE tx_hash=?');
 const add=db.prepare('INSERT INTO estate_img_hourly_allocations(epoch_start_ms,tx_hash,property_id,owner,amount_units) VALUES(?,?,?,?,?)');
 function record({txHash,ledgerIndex,source,destination,issuer,amount,receivedAtMs,verified}={}){
  if(verified!==true)throw new Error('unverified_reward_rejected');
  if(typeof txHash!=='string'||!HASH.test(txHash)||!Number.isSafeInteger(ledgerIndex)||ledgerIndex<=0)throw new TypeError('invalid_tx_reference');
  if(!sources.has(source)||destination!==treasury||issuer!==imgIssuer)throw new Error('ineligible_img_reward');
  const n=units(amount),hour=epoch(receivedAtMs);
  const prior=find.get(txHash);
  if(prior){if(prior.ledger_index!==ledgerIndex||prior.source!==source||prior.destination!==destination||prior.img_issuer!==issuer||prior.amount_units!==String(n)||prior.received_at_ms!==receivedAtMs)throw new Error('reward_hash_conflict');return {inserted:false,epochStartMs:hour};}
  insert.run(txHash,ledgerIndex,source,destination,issuer,String(n),receivedAtMs,hour);
  return {inserted:true,epochStartMs:hour};
 }
 function allocate({txHash,holdings}={}){
  const receipt=find.get(txHash);
  if(!receipt)throw new Error('reward_not_recorded');
  if(!Array.isArray(holdings)||!holdings.length)throw new TypeError('holdings_required');
  const seen=new Set();
  const rows=holdings.map(h=>{
   const propertyId=String(h.propertyId||''),owner=String(h.acct||''),weight=propertyWeight(propertyId);
   if(!ACCOUNT.test(owner)||!weight||seen.has(propertyId))throw new TypeError('invalid_or_duplicate_holding');
   seen.add(propertyId);return {propertyId,owner,weight};
  }).sort((a,b)=>a.propertyId.localeCompare(b.propertyId));
  const total=rows.reduce((s,r)=>s+BigInt(r.weight),0n),amount=BigInt(receipt.amount_units);
  let assigned=0n;
  const allocation=rows.map(r=>{const product=amount*BigInt(r.weight);const base=product/total;assigned+=base;return {...r,value:base,remainder:product%total};});
  allocation.sort((a,b)=>a.remainder===b.remainder?a.propertyId.localeCompare(b.propertyId):a.remainder>b.remainder?-1:1);
  let left=amount-assigned;
  for(let i=0;left>0n;i++,left--)allocation[i].value++;
  db.exec('BEGIN IMMEDIATE');
  try{
   const exists=db.prepare('SELECT COUNT(*) AS n FROM estate_img_hourly_allocations WHERE tx_hash=?').get(txHash).n;
   if(exists)throw new Error('reward_already_allocated');
   for(const r of allocation)add.run(receipt.epoch_start_ms,txHash,r.propertyId,r.owner,String(r.value));
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return {epochStartMs:receipt.epoch_start_ms,totalUnits:String(amount),allocations:allocation.map(r=>({propertyId:r.propertyId,owner:r.owner,amountUnits:String(r.value)})).sort((a,b)=>a.propertyId.localeCompare(b.propertyId))};
 }
 return {record,allocate};
}
module.exports={createImgHourlyRewardLedger,units,epoch};
