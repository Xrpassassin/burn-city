'use strict';
// Explicit historical bootstrap gate. This module never selects ledger ranges,
// trusts fixture addresses, or activates scanning by itself.
const HASH=/^[A-Fa-f0-9]{64}$/;
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
function createImgHistoricalBootstrap(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_img_scan_watermarks(id INTEGER PRIMARY KEY CHECK(id=1),scanned_through_ms INTEGER NOT NULL,ledger_index INTEGER NOT NULL,verified_at_ms INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_img_scan_bootstrap(
 id INTEGER PRIMARY KEY CHECK(id=1),
 start_ledger_index INTEGER NOT NULL,
 start_ledger_hash TEXT NOT NULL,
 treasury TEXT NOT NULL,
 img_issuer TEXT NOT NULL,
 source_addresses_json TEXT NOT NULL,
 configured_at_ms INTEGER NOT NULL
 );`);
 const get=db.prepare('SELECT * FROM estate_img_scan_bootstrap WHERE id=1');
 const put=db.prepare('INSERT INTO estate_img_scan_bootstrap VALUES(1,?,?,?,?,?,?)');
 function current(){const r=get.get();return r?Object.freeze({...r,allowedSources:JSON.parse(r.source_addresses_json)}):null;}
 function configure({startLedgerIndex,startLedgerHash,treasury,imgIssuer,allowedSources,configuredAtMs=Date.now(),confirmedOnChain}={}){
  if(confirmedOnChain!==true)throw new Error('on_chain_identifiers_not_confirmed');
  if(!Number.isSafeInteger(startLedgerIndex)||startLedgerIndex<1||!HASH.test(startLedgerHash||''))throw new TypeError('invalid_bootstrap_ledger');
  if(!ACCOUNT.test(treasury||'')||!ACCOUNT.test(imgIssuer||'')||!Array.isArray(allowedSources)||!allowedSources.length||allowedSources.some(a=>!ACCOUNT.test(a))||new Set(allowedSources).size!==allowedSources.length)throw new TypeError('invalid_img_addresses');
  if(!Number.isSafeInteger(configuredAtMs)||configuredAtMs<1)throw new TypeError('invalid_configured_time');
  if(get.get()||db.prepare('SELECT 1 FROM estate_img_scan_watermarks WHERE id=1').get())throw new Error('bootstrap_or_scan_already_exists');
  put.run(startLedgerIndex,startLedgerHash.toUpperCase(),treasury,imgIssuer,JSON.stringify([...allowedSources].sort()),configuredAtMs);
  return current();
 }
 return Object.freeze({current,configure});
}
module.exports={createImgHistoricalBootstrap};
