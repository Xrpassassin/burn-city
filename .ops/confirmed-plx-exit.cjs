'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{DatabaseSync}=require('node:sqlite');
const mark=stage=>fs.writeFileSync('/tmp/estate-confirmed-exit-stage.json',JSON.stringify({stage,t:Date.now(),pid:process.pid}));mark('start');
const arg=['inspect','apply'].includes(process.argv[1])?1:2,mode=process.argv[arg],expected=process.argv[arg+1],root=process.env.DATA_DIR||'/data',code=path.join(root,'gh/cur');
if(!['inspect','apply'].includes(mode)||!/^[a-f0-9]{40}$/.test(expected||''))throw Error('explicit_mode_and_commit_required');
if(fs.readFileSync(path.join(root,'gh/SHA'),'utf8').trim()!==expected)throw Error('live_commit_mismatch');
const req=createRequire(path.join(code,'package.json')),C=req('./server/config');mark('config_loaded');
const {N,value,drops,balanceDelta,xrpMovement,inspectPool}=req('./server/estate-liquidity-ledger');
const {estateCashReserve}=req('./server/estate-liquidity-runtime');
const {planManualPoolMigration,applyManualPoolMigration}=req('./server/estate-manual-pool-migration');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb',IMG={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'},PLX={currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'},RLUSD={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'},XRP={currency:'XRP'},poolAccount='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const reviewed=['581A03641BFCD81CEFDD3275ED90B396C96A0AE33D79CFD94CEF3DBA65C6ECE2','2762310505CB5C6B4F556C77CACDDD114281331F90F6964BCBBB5B5297D82F3C','0C2CAEF626729FDC45CD10A76866D16C03CC3949772D58CE09A5EC84DEFD37C0','D3A34E3FBB3D108D393485701C595416ADD0809A23D317B0EDB164B189387976','C4390EC090ACDD434AEBFAF93089E4CD9D8376064274D7E4651BF20653D0CA09','A7B1113D9A7C78624F97C501221A2C6ECF2DDB8C1D173F14FACE4B2C0A4A912F','1405C49328D81079BE24D47C5D7A2A09A974807216BA09F957D25E375B264C27','EEF16C1D0B7C87A6A5FE10AE8E49209DB05F34762F377A69C9E3E53E55A5FAB7','59FAA96D8EF6A5C35747E22E664A7E0A8FBEA5F373D746B5EF3A58E5558FBE43'];
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const pauseBefore=fs.readFileSync(path.join(root,'pause.json'),'utf8'),pause=JSON.parse(pauseBefore);
if(C.ESTATE_TREASURY!==treasury||C.NETWORK!=='mainnet'||C.DRY_RUN!==false||process.env.ESTATE_RLUSD_ENABLED==='1'||process.env.PAYOUTS_PAUSED==='true')throw Error('unexpected_production_configuration');
if(!pause.paused||pause.reason!=='unexpected_outgoing_tx'||!Array.isArray(pause.unknown)||!pause.unknown.length||pause.unknown.some(u=>u.hash!==reviewed[0]||u.type!=='AMMWithdraw'))throw Error('unreviewed_treasury_alert');
const client={connect:async()=>{},disconnect:async()=>{},request:async q=>{const {command,...params}=q;const r=await fetch('https://xrplcluster.com/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:command,params:[params]}),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('ledger_rpc_http_'+r.status);const d=await r.json();if(d.result?.error)throw Error('ledger_rpc_'+d.result.error);return d;}};let db;
(async()=>{try{
 mark('before_database');await client.connect();db=new DatabaseSync(path.join(root,'shop.db'),{readOnly:mode==='inspect'});db.exec('PRAGMA busy_timeout=3000');if(mode==='inspect')db.exec('PRAGMA query_only=ON');
 if(db.prepare("SELECT 1 FROM estate_treasury_transactions WHERE state!='applied'").get()||db.prepare("SELECT 1 FROM estate_hourly_payouts WHERE state IN ('preparing','submitted')").get())throw Error('pending_transaction_review_required');
 const proofs=[];let costs=0n,externalFees=0n;
 mark('before_proofs');const checked=await Promise.allSettled(reviewed.map(hash=>client.request({command:'tx',transaction:hash,binary:false})));
 for(let i=0;i<reviewed.length;i++){if(checked[i].status!=='fulfilled')throw checked[i].reason;const hash=reviewed[i],r=checked[i].value.result,t=r.tx_json||r;
  if(r.validated!==true||r.meta?.TransactionResult!=='tesSUCCESS'||(r.hash||t.hash)!==hash||t.Account!==treasury||!/^\d+$/.test(t.Fee)||BigInt(t.Fee)>1000000n)throw Error('reviewed_transaction_proof_failed');
  costs+=BigInt(t.Fee);proofs.push({r,t});
 }
 mark('proofs_received');const withdrawal=proofs[0],seed=proofs[8],same=(a,b)=>a?.currency===b.currency&&a.issuer===b.issuer;
 if(withdrawal.t.TransactionType!=='AMMWithdraw'||!(withdrawal.t.Flags&0x00020000)||!same(withdrawal.t.Asset,IMG)||!same(withdrawal.t.Asset2,PLX))throw Error('withdrawal_asset_identity_mismatch');
 if(seed.t.TransactionType!=='AMMCreate'||!same(seed.t.Amount,IMG)||!same(seed.t.Amount2,RLUSD))throw Error('seed_asset_identity_mismatch');
 for(const i of [1,6])if(proofs[i].t.TransactionType!=='Payment'||proofs[i].t.Destination!==treasury)throw Error('manual_swap_identity_mismatch');
 if(!same(proofs[1].t.SendMax,PLX)||typeof proofs[1].r.meta.delivered_amount!=='string'||!same(proofs[6].r.meta.delivered_amount,RLUSD))throw Error('manual_swap_asset_mismatch');
 for(const [i,amount] of [[2,'18894'],[7,'20000']]){const t=proofs[i].t;if(t.TransactionType!=='Payment'||t.Destination!=='ryouhapPYV5KNHmFUKrjNqsjxhnxvQiVt'||t.Amount!==amount)throw Error('reviewed_exchange_fee_mismatch');externalFees+=BigInt(amount);}
 if(proofs[3].t.TransactionType!=='Payment'||proofs[3].t.Destination!==PLX.issuer||!same(proofs[3].t.Amount,PLX)||value(proofs[3].t.Amount.value).gt(value('0.00000001')))throw Error('plx_dust_redemption_mismatch');
 if(proofs[4].t.TransactionType!=='TrustSet'||!same(proofs[4].t.LimitAmount,PLX)||!value(proofs[4].t.LimitAmount.value).isZero()||proofs[5].t.TransactionType!=='TrustSet'||!same(proofs[5].t.LimitAmount,RLUSD))throw Error('trustline_transition_mismatch');
 mark('before_head');const head=(await client.request({command:'ledger',ledger_index:'validated'})).result,h=head.ledger_hash||head.ledger?.ledger_hash;
 if(head.validated!==true||!/^[A-F0-9]{64}$/.test(h||''))throw Error('validated_head_required');
 async function pool(a,b,pin){const r=(await client.request({command:'amm_info',asset:a,asset2:b,ledger_hash:h})).result;if(r.ledger_hash!==h)throw Error('quote_ledger_mismatch');return inspectPool(r,{asset:a,other:b,poolAccount:pin});}
 const lineCache=new Map();async function fetchLines(peer){let marker;const all=[];for(let page=0;page<10;page++){const r=(await client.request({command:'account_lines',account:treasury,peer,ledger_hash:h,limit:400,...(marker?{marker}:{})})).result;if(r.validated!==true||r.ledger_hash!==h)throw Error('validated_inventory_required');all.push(...r.lines);marker=r.marker;if(!marker)return all;}throw Error('incomplete_inventory');}
 const lines=peer=>{if(!lineCache.has(peer))lineCache.set(peer,fetchLines(peer));return lineCache.get(peer);};
 mark('before_pool_inventory');const fetched=await Promise.allSettled([pool(IMG,RLUSD,poolAccount),pool(XRP,IMG),pool(XRP,RLUSD),lines(poolAccount),lines('rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ'),lines(PLX.issuer),lines(IMG.issuer)]);for(const result of fetched)if(result.status!=='fulfilled')throw result.reason;const [target,imgXrp,usdXrp]=fetched.slice(0,3).map(r=>r.value);
 mark('pool_inventory_received');const newLine=(await lines(poolAccount)).find(l=>l.currency===target.lp.currency);
 if(!newLine||newLine.freeze||newLine.freeze_peer)throw Error('replacement_lp_unavailable');
 const seedLp=balanceDelta(seed.r,treasury,target.lp);if(!seedLp.gt(0))throw Error('seed_lp_mint_proof_required');
 const migrationTable=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_manual_pool_migrations'").get(),priorMigration=migrationTable?db.prepare('SELECT * FROM estate_manual_pool_migrations WHERE withdraw_hash=? AND seed_hash=?').get(reviewed[0],reviewed[8]):null;
 const source=db.prepare("SELECT * FROM estate_liquidity_jobs WHERE pair='img-plx' AND state='invested'").all();if(!source.length&&priorMigration){const oldJob=db.prepare('SELECT * FROM estate_liquidity_jobs WHERE id=?').get(priorMigration.source_id);if(oldJob?.state!=='manually_migrated')throw Error('archived_source_identity_mismatch');source.push({...oldJob,state:'invested',data_json:priorMigration.source_json});}if(source.length!==1)throw Error('single_confirmed_source_position_required');
 const old=JSON.parse(source[0].data_json),oldLp={currency:old.lpCurrency,issuer:old.lpAccount},burned=balanceDelta(withdrawal.r,treasury,oldLp).negated();
 if(!burned.gt(0)||burned.lt(value(old.lp)))throw Error('withdrawn_lp_does_not_cover_position');
 const oldLine=(await lines(old.lpAccount)).find(l=>l.currency===old.lpCurrency);if(oldLine&&value(oldLine.balance).gt(0))throw Error('old_lp_remaining_requires_review');
 const plxLines=await lines(PLX.issuer);if(plxLines.some(l=>l.currency==='PLX'&&value(l.balance).abs().gt(value('0.00000001'))))throw Error('remaining_plx_requires_review');
 const assigned=db.prepare("SELECT id,data_json FROM estate_liquidity_jobs WHERE pair='img-rlusd'").all().reduce((n,j)=>{const d=JSON.parse(j.data_json);return d.lpAccount===poolAccount&&j.id!==priorMigration?.replacement_id?n.plus(d.lp):n;},value('0'));
 const available=value(newLine.balance).minus(assigned);if(!available.gt(0))throw Error('replacement_lp_already_encumbered');
 function sell(p,n){const net=100000-p.fee;return value(drops(p.a.times(n).times(net).div(p.b.times(100000).plus(n.times(net))).times(9700).div(10000)));}
 const exitQuote=lp=>{const share=lp.div(target.supply);return sell(imgXrp,target.a.times(share)).plus(sell(usdXrp,target.b.times(share)));};
 const imgLine=(await lines(IMG.issuer)).find(l=>l.currency==='IMG');const liability=req('./server/estate-reward-reserves').rewardImgLiabilityUnits(db);
 const imgInventory=db.prepare('SELECT data_json FROM estate_liquidity_jobs').all().reduce((n,j)=>{const d=JSON.parse(j.data_json);return n.plus(d.img||'0').plus(d.residualImg||'0');},value('0'));
 if(!imgLine||imgLine.freeze||imgLine.freeze_peer||value(imgLine.balance).minus(imgInventory).times(1000000).lt(liability.toString()))throw Error('existing_img_reward_inventory_missing');
 mark('before_spendable');const spareXrp=await req('./server/guard').spendable(client,treasury);if(!Number.isFinite(spareXrp)||spareXrp<1000)throw Error('treasury_operating_reserve_insufficient');
 mark('before_plan');const verifiedCostsDrops=String(costs+externalFees),plan=planManualPoolMigration({job:source[0],pool:target,availableLp:available.toFixed(),exitQuote,withdrawHash:reviewed[0],seedHash:reviewed[8],verifiedCostsDrops});
 mark('planned');const report={mode,commit:expected,poolAccount,sourceBasisDrops:old.basis,withdrawnLp:burned.toFixed(),trackedSourceLp:old.lp,returnedImg:balanceDelta(withdrawal.r,treasury,IMG).toFixed(),returnedPlx:balanceDelta(withdrawal.r,treasury,PLX).toFixed(),seedLpMinted:seedLp.toFixed(),availableLp:available.toFixed(),existingImgLiabilityUnits:liability.toString(),spareXrpDrops:spareXrp,replacementBasisDrops:plan.basisDrops,migrationCostDrops:verifiedCostsDrops,replacementLp:JSON.parse(plan.replacementJson).lp,conservativeExitDrops:exitQuote(value(JSON.parse(plan.replacementJson).lp)).toFixed(),reservedCashDrops:estateCashReserve(db),reviewedTransactions:reviewed,ready:true,rlusdRoutingEnabled:false};
 if(mode==='apply'){
  if(fs.readFileSync(path.join(root,'pause.json'),'utf8')!==pauseBefore)throw Error('pause_changed_during_review');
  const before=estateCashReserve(db);report.migration=applyManualPoolMigration(db,plan,{verifiedLedgerIndex:Number(head.ledger_index??head.ledger?.ledger_index),verifiedAtMs:Date.now(),verifiedWithdrawLp:burned.toFixed(),verifiedSeedLp:seedLp.toFixed(),verifiedCostsDrops});
  if(estateCashReserve(db)!==before)throw Error('cash_reserve_changed');db.close();db=null;
  const known=new Set(read('watch_known.json'));for(const hash of reviewed)known.add(hash);req('./server/store').save('watch_known.json',[...known]);
  req('./server/watch').unpause();report.unpaused=true;
 }
 mark('reported');console.log(JSON.stringify(report));
}finally{db?.close();await client.disconnect();}})().then(()=>process.stdout.write('',()=>process.exit(0)),e=>{console.error(e.message);process.stderr.write('',()=>process.exit(1));});
