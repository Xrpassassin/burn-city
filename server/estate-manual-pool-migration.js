'use strict';
// Internal maintenance only: no HTTP route, signing or ledger submission.
const crypto=require('node:crypto');
const {N,value,token}=require('./estate-liquidity-ledger');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function planManualPoolMigration({job,pool,availableLp,exitQuote,withdrawHash,seedHash,verifiedCostsDrops='0'}={}){
 if(job?.pair!=='img-plx'||job.state!=='invested'||![withdrawHash,seedHash].every(h=>/^[A-F0-9]{64}$/.test(h||'')))throw Error('verified_manual_migration_required');
 const d=JSON.parse(job.data_json);
 if(!value(d.lp).gt(0)||['img','plx','residualImg'].some(k=>!value(d[k]||'0').isZero()))throw Error('unsupported_manual_inventory');
 if(!/^\d+$/.test(verifiedCostsDrops))throw Error('invalid_migration_costs');
 const basis=['basis','imgCost','plxCost','fees','residualImgCost','residualPlxCost'].reduce((n,k)=>n.plus(value(d[k]||'0')),value(verifiedCostsDrops));
 if(!basis.isInteger()||!basis.gt(0)||!/^\d+$/.test(d.cash)||!value(availableLp).gt(0))throw Error('invalid_migration_basis');
 let low=value('0'),high=value(availableLp);
 if(exitQuote(high).lt(basis))throw Error('replacement_lp_cannot_cover_recorded_basis');
 for(let i=0;i<160;i++){const mid=low.plus(high).div(2);if(exitQuote(mid).gte(basis))high=mid;else low=mid;}
 let lp=high.precision(16,N.ROUND_UP);if(lp.gt(value(availableLp)))lp=value(token(availableLp));
 if(lp.gt(value(availableLp))||exitQuote(lp).lt(basis))throw Error('replacement_lp_rounding_exceeds_inventory');
 const empty={cash:'0',img:'0',plx:'0',rlusd:'0',imgCost:'0',plxCost:'0',rlusdCost:'0',fees:'0',lp:'0',basis:'0',generation:0,carryBasis:null};
 const replacement={...empty,cash:d.cash,lp:lp.toFixed(),basis:basis.toFixed(),lpAccount:pool.account,lpCurrency:pool.lp.currency,manualWithdrawal:withdrawHash,manualSeed:seedHash};
 const archived={...d,...empty,residualImg:'0',residualImgCost:'0',residualPlx:'0',residualPlxCost:'0',residualRlusd:'0',residualRlusdCost:'0'};
 return {sourceId:job.id,replacementId:hash(job.purchase_tx+':img-rlusd'),purchaseTx:job.purchase_tx,sourceJson:job.data_json,archivedJson:JSON.stringify(archived),replacementJson:JSON.stringify(replacement),basisDrops:basis.toFixed(),verifiedCostsDrops,withdrawHash,seedHash};
}
function applyManualPoolMigration(db,plan,{verifiedLedgerIndex,verifiedAtMs,verifiedWithdrawLp,verifiedSeedLp,verifiedCostsDrops='0'}={}){
 if(!Number.isSafeInteger(verifiedLedgerIndex)||verifiedLedgerIndex<1||!Number.isSafeInteger(verifiedAtMs)||verifiedAtMs<1||!value(verifiedWithdrawLp).gt(0)||!value(verifiedSeedLp).gt(0))throw Error('verified_migration_evidence_required');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_manual_pool_migrations(source_id TEXT PRIMARY KEY,replacement_id TEXT NOT NULL UNIQUE,withdraw_hash TEXT NOT NULL,seed_hash TEXT NOT NULL,source_json TEXT NOT NULL,basis_drops TEXT NOT NULL,migration_cost_drops TEXT NOT NULL,verified_ledger INTEGER NOT NULL,verified_at_ms INTEGER NOT NULL);`);
 const prior=db.prepare('SELECT * FROM estate_manual_pool_migrations WHERE source_id=?').get(plan.sourceId);
 if(prior){if(prior.withdraw_hash!==plan.withdrawHash||prior.seed_hash!==plan.seedHash||prior.replacement_id!==plan.replacementId||prior.basis_drops!==plan.basisDrops)throw Error('migration_identity_conflict');return {alreadyApplied:true};}
 const {estateCashReserve}=require('./estate-liquidity-runtime'),before=estateCashReserve(db);
 db.exec('BEGIN IMMEDIATE');try{
  const source=db.prepare('SELECT * FROM estate_liquidity_jobs WHERE id=?').get(plan.sourceId),old=source&&JSON.parse(source.data_json),fresh=JSON.parse(plan.replacementJson);
  if(!/^\d+$/.test(verifiedCostsDrops)||plan.verifiedCostsDrops!==verifiedCostsDrops)throw Error('migration_cost_evidence_conflict');
  const expectedBasis=old&&['basis','imgCost','plxCost','fees','residualImgCost','residualPlxCost'].reduce((n,k)=>n.plus(old[k]||'0'),value(verifiedCostsDrops));
  if(!expectedBasis||!expectedBasis.eq(value(plan.basisDrops))||fresh.basis!==plan.basisDrops||fresh.cash!==old.cash||!value(fresh.lp).gt(0)||!value(JSON.parse(plan.archivedJson).cash).isZero()||!value(JSON.parse(plan.archivedJson).lp).isZero())throw Error('migration_basis_or_cash_conflict');
  if(!source||source.pair!=='img-plx'||source.state!=='invested'||source.data_json!==plan.sourceJson||source.purchase_tx!==plan.purchaseTx||value(old.lp).gt(value(verifiedWithdrawLp))||value(fresh.lp).gt(value(verifiedSeedLp)))throw Error('migration_source_or_inventory_conflict');
  if(db.prepare('SELECT 1 FROM estate_liquidity_jobs WHERE id=? OR (purchase_tx=? AND pair=\'img-rlusd\')').get(plan.replacementId,plan.purchaseTx))throw Error('replacement_position_already_exists');
  db.prepare("UPDATE estate_liquidity_jobs SET state='manually_migrated',data_json=?,note=NULL WHERE id=?").run(plan.archivedJson,plan.sourceId);
  // The original job retains its original budget identity for restart/replay.
  // Replacement budget is zero to avoid subtracting the same principal twice.
  db.prepare("INSERT INTO estate_liquidity_jobs(id,purchase_tx,pair,initial_budget_drops,state,data_json,last_harvest_hour) VALUES(?,?,'img-rlusd','0','invested',?,?)").run(plan.replacementId,plan.purchaseTx,plan.replacementJson,verifiedAtMs-verifiedAtMs%3600000);
  db.prepare('INSERT INTO estate_manual_pool_migrations VALUES(?,?,?,?,?,?,?,?,?)').run(plan.sourceId,plan.replacementId,plan.withdrawHash,plan.seedHash,plan.sourceJson,plan.basisDrops,verifiedCostsDrops,verifiedLedgerIndex,verifiedAtMs);
  if(estateCashReserve(db)!==before)throw Error('migration_changed_cash_reservations');
  db.exec('COMMIT');return {alreadyApplied:false,basisDrops:plan.basisDrops,replacementId:plan.replacementId};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
module.exports={planManualPoolMigration,applyManualPoolMigration};
