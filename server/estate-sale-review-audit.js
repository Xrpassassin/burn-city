'use strict';
const crypto=require('node:crypto');
// Server-only administrative decision ledger. A recorded decision is NOT a refund,
// transfer, ownership grant or change to the payment review status.
function createEstateReviewAudit(db,{adminAccounts=[]}={}){
 if(!db||typeof db.exec!=='function'||typeof db.prepare!=='function')throw new TypeError('sqlite_db_required');
 if(!Array.isArray(adminAccounts)||adminAccounts.some(a=>typeof a!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)))throw new TypeError('invalid_admin_allowlist');
 const admins=new Set(adminAccounts);
 db.exec(`CREATE TABLE IF NOT EXISTS estate_late_payment_review_audit(
  event_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('investigate','refund_recommended','ownership_review_recommended','no_action_recommended')),
  rationale TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(reservation_id) REFERENCES estate_late_payment_reviews(reservation_id)
 )`);
 const insert=db.prepare('INSERT INTO estate_late_payment_review_audit(event_id,reservation_id,actor,decision,rationale,created_at) VALUES(?,?,?,?,?,?)');
 const exists=db.prepare('SELECT 1 FROM estate_late_payment_reviews WHERE reservation_id=?');
 const list=db.prepare('SELECT event_id,reservation_id,actor,decision,rationale,created_at FROM estate_late_payment_review_audit WHERE reservation_id=? ORDER BY created_at,event_id');
 function authorized(actor){return typeof actor==='string'&&admins.has(actor);}
 function record({actor,reservationId,decision,rationale,now=Date.now()}={}){
  if(!authorized(actor))return {ok:false,error:'admin_not_authorized'};
  if(typeof reservationId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(reservationId)||!exists.get(reservationId))return {ok:false,error:'review_not_found'};
  if(!['investigate','refund_recommended','ownership_review_recommended','no_action_recommended'].includes(decision))return {ok:false,error:'invalid_decision'};
  if(typeof rationale!=='string'||rationale.trim().length<10||rationale.length>2000)return {ok:false,error:'invalid_rationale'};
  if(!Number.isSafeInteger(now)||now<1)return {ok:false,error:'invalid_timestamp'};
  const eventId=crypto.randomUUID();
  insert.run(eventId,reservationId,actor,decision,rationale.trim(),now);
  return {ok:true,eventId,decision,actionExecuted:false};
 }
 function history({actor,reservationId}={}){
  if(!authorized(actor))return {ok:false,error:'admin_not_authorized'};
  if(typeof reservationId!=='string'||!exists.get(reservationId))return {ok:false,error:'review_not_found'};
  return {ok:true,events:list.all(reservationId)};
 }
 return {record,history};
}
module.exports={createEstateReviewAudit};
