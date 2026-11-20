'use strict';
// Regression for the live bug (Nov 18 2026): Xaman rejects custom_meta.identifier > 40 chars
// (HTTP 413) and the SDK returns null, so every upgrade request failed and left the order in
// payload_state 'creating' forever. Identifiers must fit, and a failed create must be
// recoverable only with Xaman's definitive "not found" — never by awarding anything.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateTycoonRuntime,xamanIdentifier}=require('./estate-tycoon-runtime');
const buyer='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const config={DRY_RUN:false,NETWORK:'mainnet',XUMM_KEY:'t',XUMM_SECRET:'t',ESTATE_TREASURY:treasury};
const UUID='1289e9ae-7d5d-4d5f-b89c-18633112ce09';
function db0(){const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01',buyer,'B'.repeat(64),3000000,1,1);return db;}
(async()=>{
 assert.equal(xamanIdentifier('tycoon_'+'a'.repeat(40)).length,40);
 assert.notEqual(xamanIdentifier('tycoon_'+'a'.repeat(39)+'b'),xamanIdentifier('tycoon_'+'a'.repeat(40)));
 // 1. Happy path: identifier fits Xaman's 40-char limit; QR + deeplink returned.
 {const db=db0();let body;const sdk={payload:{create:async p=>{body=p;
   if(p.custom_meta.identifier.length>40)return null; // real SDK behaviour on 413
   return {uuid:UUID,next:{always:'https://xumm.app/sign/'+UUID}};},get:async()=>null}};
  const rt=createEstateTycoonRuntime({db,pay:{sdk:()=>sdk},config,env:{ESTATE_TYCOON_UPGRADES_ENABLED:'1'},paused:()=>false});
  const r=await rt.start({propertyId:'trailer-01',itemId:'porch-lights',buyer});
  assert(r.ok,JSON.stringify(r));assert(body.custom_meta.identifier.length<=40);
  assert.equal(r.qr,'https://xumm.app/sign/'+UUID+'_q.png');assert.equal(r.deeplink,'https://xumm.app/sign/'+UUID);
  assert.equal(body.txjson.Amount,'3000000');assert.equal(body.txjson.Destination,treasury);}
 // 2. Failed create (null) -> review, held, nothing awarded; Check payment never awards.
 const db=db0();let now=1800000000000,mode='fail',ci='404',signedPayload=null,creates=0,lookups=[];
 const sdk={payload:{create:async()=>{creates++;if(mode==='fail')return null;return {uuid:UUID,next:{always:'https://xumm.app/sign/'+UUID}};},
  get:async(id,returnErrors)=>{
   if(String(id).startsWith('ci/')){lookups.push({id,returnErrors});
    if(ci==='404')throw Error('Error code 404, see XUMM Dev Console, reference: x');
    if(ci==='net')throw Error('fetch failed');
    return signedPayload;}
   return signedPayload||{meta:{signed:false,expired:true},response:{}};}}};
 const warn=console.warn;console.warn=()=>{};
 const rt=createEstateTycoonRuntime({db,pay:{sdk:()=>sdk,ledger:async()=>{throw Error('no ledger')}},config,env:{ESTATE_TYCOON_UPGRADES_ENABLED:'1'},paused:()=>false,clock:()=>now});
 const a=await rt.start({propertyId:'trailer-01',itemId:'porch-lights',buyer});
 assert.equal(a.error,'tycoon_order_requires_review');
 assert.equal(db.prepare('SELECT payload_state s FROM estate_tycoon_orders').get().s,'creating');
 for(let i=0;i<3;i++){const c=await rt.confirm({orderId:a.orderId,buyer});assert.equal(c.ok,false);assert.equal(c.pending,true);}
 assert.equal((await rt.start({propertyId:'trailer-01',itemId:'porch-lights',buyer})).error,'tycoon_payload_pending','retry never creates a duplicate request');
 assert.equal(creates,1);assert.equal(lookups.length,0,'no recovery inside the window');
 assert.deepEqual(rt.publicState().properties.find(p=>p.propertyId==='trailer-01').unlockedItemIds,[]);
 // 3. Past window+grace: a network error on the lookup keeps holding.
 now+=16*60000;ci='net';
 assert.equal((await rt.confirm({orderId:a.orderId,buyer})).pending,true);
 assert.equal(db.prepare('SELECT payload_state s FROM estate_tycoon_orders').get().s,'creating');
 assert.equal(lookups.at(-1).returnErrors,true);assert.equal(lookups.at(-1).id,'ci/'+xamanIdentifier(a.orderId));
 // 4. Definitive 404: released and archived; a fresh purchase works.
 ci='404';
 assert.deepEqual(await rt.confirm({orderId:a.orderId,buyer}),{ok:false,error:'tycoon_order_expired',released:true});
 assert.equal(db.prepare('SELECT reason FROM estate_tycoon_voided_orders WHERE order_id=?').get(a.orderId).reason,'payload_never_created');
 mode='ok';const b=await rt.start({propertyId:'trailer-01',itemId:'porch-lights',buyer});assert(b.ok);assert.equal(creates,2);
 // 5. A 'creating' row whose payload does exist and was signed is bound, never released.
 db.prepare("UPDATE estate_tycoon_orders SET payload_state='creating',payload_uuid=NULL WHERE order_id=?").run(b.orderId);
 now+=16*60000;ci='found';signedPayload={meta:{uuid:UUID,signed:true,expired:true},response:{txid:'A'.repeat(64),account:buyer}};
 const c=await rt.start({propertyId:'trailer-01',itemId:'flower-garden',buyer});
 assert.equal(c.error,'another_upgrade_pending');
 const row=db.prepare('SELECT payload_state s,payload_uuid u,status FROM estate_tycoon_orders WHERE order_id=?').get(b.orderId);
 assert.deepEqual({...row},{s:'bound',u:UUID,status:'reserved'});
 assert.equal(db.prepare("SELECT COUNT(*) n FROM estate_tycoon_orders WHERE status='settled'").get().n,0);
 assert.equal(db.prepare('SELECT share_units FROM estate_property_ownership').get().share_units,1);
 console.warn=warn;
 console.log('estate tycoon Xaman request: 40-char identifier, QR, failed-create recovery, no unpaid award passed');
})().catch(e=>{console.error(e);process.exit(1);});
