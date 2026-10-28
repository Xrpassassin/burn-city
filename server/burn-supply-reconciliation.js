'use strict';
const {assessBurnLaunchEvidence}=require('./burn-launch-evidence');
const {BURN_ISSUER:issuer,BURN_CURRENCY:currency,BURN_LAUNCH_SUPPLY:supply,decimalUnits}=require('./issuer-return-history');
const SCALE=decimalUnits('1').scale,DIGITS=SCALE.toString().length-1;
const units=value=>{const p=decimalUnits(value);if(!p)throw Error('invalid or unsupported decimal amount');return p.units;};
const display=n=>{const rem=(n%SCALE).toString().padStart(DIGITS,'0').replace(/0+$/,'');return String(n/SCALE)+(rem?'.'+rem:'');};
function reconcileBurnSupply({launchEvidence,current,gateway,escrowPages,pinnedLedger,now=Date.now()}={}){
 const invalid=reason=>({status:'unverified',method:'fixed_issuance_supply_v1',token_key:issuer+'-'+currency,burned:null,burned_pct:null,reason});
 try{
  const c=current?.result||current,g=gateway?.result||gateway;
  const launch=assessBurnLaunchEvidence({...launchEvidence,current});
  if(!launch.verified)return invalid(launch.errors.join('; '));
  const pin=c.ledger_index,hash=c.ledger_hash;
  const matches=r=>r?.validated===true&&r.ledger_index===pin&&r.ledger_hash===hash;
  const ledgerPinned=pinnedLedger?.index===pin&&pinnedLedger?.hash===hash;
  // Some gateway_balances servers omit ledger_hash in their reply; a request
  // made with the validated ledger_hash, plus matching validated sequence,
  // still pins the read. Never accept a conflicting hash.
  const gatewayMatches=g?.validated===true&&g.ledger_index===pin&&
    (g.ledger_hash===hash || (g.ledger_hash==null&&ledgerPinned));
  if(!/^[A-Fa-f0-9]{64}$/.test(hash||'')||!gatewayMatches||g.account!==issuer)
    return invalid('gateway balances are not pinned to the validated issuer snapshot');
  if(!Number.isFinite(now)||now<=0)return invalid('invalid check time');
  if(Object.keys(g.balances||{}).length||Object.keys(g.assets||{}).length)return invalid('excluded wallets or unexpected issuer assets require review');
  if(!Array.isArray(escrowPages)||!escrowPages.length)return invalid('complete escrow directory required');
  let escrow=0n;const markers=new Set(),objects=new Set();
  for(let i=0;i<escrowPages.length;i++){
   const r=escrowPages[i]?.result||escrowPages[i];
   if(!matches(r)||r.account!==issuer||!Array.isArray(r.account_objects)||(i<escrowPages.length-1&&!r.marker)||(i===escrowPages.length-1&&r.marker))return invalid('incomplete or mismatched escrow pagination');
   if(r.marker){const k=JSON.stringify(r.marker);if(markers.has(k))return invalid('repeated escrow marker');markers.add(k);}
   for(const e of r.account_objects){
    if(e.LedgerEntryType!=='Escrow'||!e.index||objects.has(e.index))return invalid('invalid or duplicate escrow object');objects.add(e.index);
    if(e.Amount?.issuer===issuer&&e.Amount.currency===currency)escrow+=units(e.Amount.value);
   }
  }
  const locked=units(g.locked?.[currency]??'0');if(escrow!==locked)return invalid('escrow total disagrees with gateway locked supply');
  let frozen=0n;for(const amounts of Object.values(g.frozen_balances||{}))for(const a of amounts)if(a.currency===currency)frozen+=units(a.value);
  const normal=units(g.obligations?.[currency]??'0'),initial=units(supply),outstanding=normal+frozen+locked;
  if(outstanding>initial)return invalid('outstanding supply exceeds verified initial issuance');
  const retired=initial-outstanding;
  return {status:'verified',method:'fixed_issuance_supply_v1',token_key:issuer+'-'+currency,issued:supply,
   outstanding:display(outstanding),frozen:display(frozen),escrow:display(locked),burned:display(retired),
   burned_pct:Number(retired*1000000n/initial)/10000,ledger_index:pin,ledger_hash:hash,t_ms:now,
   launch_ledger:launch.launch_ledger,issuance_hash:launch.issuance_hash,
   evidence:{launch_supply_verified:true,issuer_verified:true,escrow_reconciled:true,no_excluded_wallets:true},
   precision:'Gateway totals use XRPL issued-currency rounding; token amounts are approximate aggregates.',
   scope:'Net supply reduction since initial issuance. Outstanding includes pool holdings, frozen balances and escrow; this is not a count or leaderboard of individual burn Payments.'};
 }catch(e){return invalid(e.message||'invalid reconciliation input');}
}
module.exports={reconcileBurnSupply};
