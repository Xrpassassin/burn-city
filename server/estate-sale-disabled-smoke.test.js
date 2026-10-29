'use strict';
// Safe dry-run regression: exercise disabled purchase gates with a realistic
// reservation request, without an XRPL connection or live Xaman SDK.
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateReservationApi}=require('./estate-sale-reservation-api');
const {createEstateXamanPaymentSession}=require('./estate-sale-xaman-session');
const {createEstateSaleFinalization}=require('./estate-sale-finalization');
const {estatePurchaseQuote}=require('./estate-sale-quote');
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY)');
const buyer='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const reservation=createEstateReservationApi(db);
const payment=createEstateXamanPaymentSession(db);
const finalization=createEstateSaleFinalization(db);
(async()=>{
 const quote=estatePurchaseQuote(db,{propertyId:'trailer-01',buyer});
 assert.equal(quote.ok,true);
 assert.equal(quote.priceDrops,3000000);
 assert.equal(reservation.create({buyer,propertyId:'trailer-01'}).error,'estate_sales_disabled');
 assert.equal((await payment.start({reservationId:'estate_'+'a'.repeat(32),buyer})).error,'estate_sales_disabled');
 assert.equal((await finalization.finalize({reservationId:'estate_'+'a'.repeat(32),buyer})).error,'estate_sales_disabled');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM estate_sale_reservations').get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM estate_property_ownership').get().n,0);
 console.log('Estates safe dry-run purchase gates passed; no XRP, reservation or ownership mutations');
})().catch(e=>{console.error(e);process.exitCode=1});
