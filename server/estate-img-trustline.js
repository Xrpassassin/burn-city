'use strict';
// Only the authenticated holder can authorize this TrustSet in Xaman.
const xrpl=require('xrpl');
const {value}=require('./estate-liquidity-ledger');
function createEstateImgTrustline({db,client,sdk,config,now=()=>Date.now()}={}){
 db.exec('CREATE TABLE IF NOT EXISTS estate_img_trustline_requests(owner TEXT PRIMARY KEY,payload_uuid TEXT NOT NULL,deeplink TEXT NOT NULL,expires_at INTEGER NOT NULL)');
 const busy=new Set();
 async function status(owner){
  if(config.NETWORK!=='mainnet'||!xrpl.isValidClassicAddress(owner)||owner===config.IMG_ISSUER)throw Error('invalid_trustline_account');
  const head=(await client.request({command:'ledger',ledger_index:'validated'})).result;
  const hash=head?.ledger_hash||head?.ledger?.ledger_hash;
  if(head?.validated!==true||!/^[A-Fa-f0-9]{64}$/.test(hash||''))throw Error('validated_ledger_required');
  let marker,line;
  for(let page=0;page<10;page++){
   const r=(await client.request({command:'account_lines',account:owner,peer:config.IMG_ISSUER,ledger_hash:hash,limit:400,...(marker?{marker}:{})})).result;
   if(r?.validated!==true||r.ledger_hash!==hash||!Array.isArray(r.lines))throw Error('validated_trustline_required');
   line=r.lines.find(l=>l.currency==='IMG'&&l.account===config.IMG_ISSUER)||line;marker=r.marker;
   if(!marker)break;if(page===9)throw Error('incomplete_trustline_state');
  }
  return {ok:true,account:owner,currency:'IMG',issuer:config.IMG_ISSUER,exists:!!line,
   ready:!!line&&!line.freeze&&!line.freeze_peer&&value(line.limit).gt(value(line.balance)),
   frozen:!!(line?.freeze||line?.freeze_peer),limitReview:!!line&&value(line.limit).gte('1000000000')&&value(line.balance).gte(value(line.limit)),ledgerHash:hash};
 }
 async function start(owner){
  if(busy.has(owner))throw Error('trustline_request_pending');busy.add(owner);
  try{
   const state=await status(owner);if(state.ready)return {...state,alreadyExists:true};
   if(state.frozen)throw Error('img_trustline_frozen');if(state.limitReview)throw Error('trustline_limit_review_required');
   const prior=db.prepare('SELECT * FROM estate_img_trustline_requests WHERE owner=?').get(owner);
   if(prior&&prior.expires_at>now())return {...state,payloadUuid:prior.payload_uuid,deeplink:prior.deeplink,reused:true};
   const api=sdk();if(typeof api?.payload?.create!=='function')throw Error('xaman_unavailable');
   const txjson={TransactionType:'TrustSet',Account:owner,Flags:131072,LimitAmount:{currency:'IMG',issuer:config.IMG_ISSUER,value:'1000000000'}};
   const p=await api.payload.create({txjson,options:{submit:true,expire:10,force_network:'MAINNET'},custom_meta:{instruction:'BURN City: enable IMG rewards. Review the IMG issuer, trust limit, wallet reserve and network fee before signing.'}});
   if(!p?.uuid||!p?.next?.always||!/^https:\/\/(?:xumm\.app|xaman\.app)\//.test(p.next.always))throw Error('xaman_payload_unavailable');
   db.prepare('INSERT INTO estate_img_trustline_requests VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET payload_uuid=excluded.payload_uuid,deeplink=excluded.deeplink,expires_at=excluded.expires_at').run(owner,p.uuid,p.next.always,now()+600000);
   return {...state,payloadUuid:p.uuid,deeplink:p.next.always,transaction:txjson};
  }finally{busy.delete(owner);}
 }
 return {status,start};
}
module.exports={createEstateImgTrustline};
