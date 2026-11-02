'use strict';
// Durable, immutable start boundary for future-only IMG/RLUSD reward accounting.
// Additive table only; does not change historic owner rewards or authorize payouts.
const {planProspectiveRlusdStart}=require('./estate-rlusd-prospective-rewards');
function createEstateRlusdForwardStartStore(db){
 if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function')
  throw Error('sqlite_database_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_rlusd_forward_reward_start(
  id INTEGER PRIMARY KEY CHECK(id=1),
  ledger_index INTEGER NOT NULL CHECK(ledger_index>0),
  ledger_hash TEXT NOT NULL,
  pool_account TEXT NOT NULL,
  ledger_close_time_ms INTEGER NOT NULL,
  first_eligible_hour_ms INTEGER NOT NULL,
  historical_principal_units TEXT NOT NULL,
  opening_liquidation_units TEXT NOT NULL,
  protected_baseline_units TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status='staged')
 );`);
 const read=db.prepare('SELECT * FROM estate_rlusd_forward_reward_start WHERE id=1');
 const insert=db.prepare(`INSERT INTO estate_rlusd_forward_reward_start
 (id,ledger_index,ledger_hash,pool_account,ledger_close_time_ms,first_eligible_hour_ms,
 historical_principal_units,opening_liquidation_units,protected_baseline_units,status)
 VALUES(1,?,?,?,?,?,?,?,?,'staged')`);
 function current(){
  const row=read.get();
  if(!row)return null;
  return Object.freeze({policyVersion:1,poolAccount:row.pool_account,
   ledgerIndex:row.ledger_index,ledgerHash:row.ledger_hash,
   ledgerCloseTimeMs:row.ledger_close_time_ms,
   firstFullHourMs:row.first_eligible_hour_ms,
   historicPrincipalUnits:row.historical_principal_units,
   openingLiquidationUnits:row.opening_liquidation_units,
   protectedBaselineUnits:row.protected_baseline_units,
   status:row.status,distributionsEnabled:false});
 }
 function stage(input){
  // Caller MUST provide independently reconciled ledger and accounting evidence.
  // This function checks the boundary shape; it does not independently fetch XRPL.
  const planned=planProspectiveRlusdStart(input);
  db.exec('BEGIN IMMEDIATE');
  try{
   if(read.get())throw Error('forward_reward_start_already_locked');
   insert.run(planned.ledgerIndex,planned.ledgerHash,planned.poolAccount,
    planned.ledgerCloseTimeMs,planned.firstFullHourMs,planned.historicPrincipalUnits,
    planned.openingLiquidationUnits,planned.protectedBaselineUnits);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  return current();
 }
 return Object.freeze({current,stage});
}
module.exports={createEstateRlusdForwardStartStore};
