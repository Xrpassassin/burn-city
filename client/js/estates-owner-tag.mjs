// Short, already-public owner labels for in-world nameplates.
// Classic XRPL addresses are published by GET /api/estates/ownership.
// Never print balances, prices, payouts or other financial fields here.
const CLASSIC=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
export function isPublicEstateOwner(acct){
 return CLASSIC.test(String(acct||''));
}
export function estateOwnerTag(acct){
 if(!isPublicEstateOwner(acct))return '';
 const a=String(acct);
 return a.slice(0,4)+'\u2026'+a.slice(-4);
}
export function estateNameplateLines(lot,owner){
 const tag=estateOwnerTag(owner);
 const address=typeof lot?.address==='string'?lot.address.trim():'';
 const lines=[];
 if(address)lines.push(address);
 if(tag)lines.push(tag);
 return lines;
}
