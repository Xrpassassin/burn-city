'use strict';
// Read-only XRP payment verifier. No ownership mutation or wallet signing.
// Caller must obtain the reservation from the trusted SQLite reservation store.
async function verifyEstateSalePayment(client,reservation,{txHash,treasury,now=Date.now(),reviewExpired=false}={}){
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 if(typeof txHash!=='string'||!/^[a-fA-F0-9]{64}$/.test(txHash))throw new TypeError('invalid_transaction_hash');
 if(typeof treasury!=='string'||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(treasury))throw new TypeError('invalid_treasury');
 if(!reservation||(reservation.status!=='reserved'&&!(reviewExpired===true&&reservation.status==='expired'))||typeof reservation.buyer!=='string'||!Number.isSafeInteger(reservation.price_drops)||reservation.price_drops<1||!Number.isSafeInteger(reservation.created_at)||!Number.isSafeInteger(reservation.expires_at))throw new Error('invalid_or_inactive_reservation');
 if(!Number.isSafeInteger(now)||(now>reservation.expires_at&&reviewExpired!==true))throw new Error('reservation_expired');
 const response=await client.request({command:'tx',transaction:txHash,binary:false});
 const tx=response?.result;
 const body=tx?.tx_json||tx?.transaction||tx;
 const meta=tx?.meta||tx?.metaData;
 if(tx?.validated!==true||body?.TransactionType!=='Payment'||meta?.TransactionResult!=='tesSUCCESS')throw new Error('payment_not_validated_success');
 const returnedHash=body?.hash??tx?.hash;
 if(typeof body?.hash==='string'&&typeof tx?.hash==='string'&&body.hash.toUpperCase()!==tx.hash.toUpperCase())throw new Error('payment_hash_mismatch');
 if(typeof returnedHash!=='string'||!/^[a-fA-F0-9]{64}$/.test(returnedHash)||returnedHash.toUpperCase()!==txHash.toUpperCase())throw new Error('payment_hash_mismatch');
 if(body.Account!==reservation.buyer||body.Destination!==treasury)throw new Error('payment_sender_or_destination_mismatch');
 if(typeof body.Amount!=='string'||!/^[0-9]+$/.test(body.Amount)||BigInt(body.Amount)!==BigInt(reservation.price_drops))throw new Error('payment_amount_mismatch');
 const delivered=meta?.delivered_amount;
 if(typeof delivered!=='string'||!/^[0-9]+$/.test(delivered)||BigInt(delivered)!==BigInt(reservation.price_drops))throw new Error('payment_delivered_amount_mismatch');
 const expectedType=Buffer.from('burncity/estates').toString('hex').toUpperCase();
 const expectedMemo=Buffer.from(reservation.reservation_id).toString('hex').toUpperCase();
 if(!Array.isArray(body.Memos)||body.Memos.length!==1||body.Memos[0]?.Memo?.MemoType?.toUpperCase()!==expectedType||body.Memos[0]?.Memo?.MemoData?.toUpperCase()!==expectedMemo)throw new Error('payment_reservation_memo_mismatch');
 if(body.Flags!==undefined&&(!Number.isSafeInteger(body.Flags)||body.Flags<0||(body.Flags & 0x00020000)!==0))throw new Error('partial_payment_not_allowed');
 if(body.DestinationTag!==undefined||body.InvoiceID!==undefined)throw new Error('unexpected_payment_routing');
 const closeDate=body.date??tx.date;
 if(typeof closeDate!=='number'||!Number.isSafeInteger(closeDate))throw new Error('payment_timestamp_unavailable');
 if(body.date!==undefined&&tx.date!==undefined&&body.date!==tx.date)throw new Error('payment_timestamp_conflict');
 // XRPL date is seconds since 2000-01-01; reserve against pre-existing transactions.
 const paymentAt=(closeDate+946684800)*1000;
 if(paymentAt<reservation.created_at-1000||paymentAt>reservation.expires_at+1000)throw new Error('payment_outside_reservation_window');
 if(!Number.isSafeInteger(tx.ledger_index)||tx.ledger_index<1)throw new Error('payment_ledger_unavailable');
 return Object.freeze({reservationId:reservation.reservation_id,propertyId:reservation.property_id,buyer:reservation.buyer,txHash:txHash.toUpperCase(),amountDrops:reservation.price_drops,ledgerIndex:tx.ledger_index,validated:true,settlementVerified:reviewExpired!==true,reviewOnly:reviewExpired===true,ownershipAssigned:false,distributable:false});
}
module.exports={verifyEstateSalePayment};
