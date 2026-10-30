// Runs on GitHub's runner with the existing app-scoped Fly credential.
// This orchestrates only an explicitly requested, SHA-bound production activation.
import fs from 'node:fs';
const expected=process.env.ESTATE_EXPECTED_COMMIT,token=process.env.FLY_API_TOKEN;
if(!/^[a-f0-9]{40}$/.test(expected||'')||!token||process.env.CONFIRM_ESTATES_ACTIVATION!=='70-30-realized-earnings-only')throw Error('explicit_activation_context_required');
const endpoint='https://api.machines.dev/v1/apps/burn-city-game/machines/8d2909be270068';
const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function call(url,options={}){const r=await fetch(url,{...options,headers,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('fly_activation_http_'+r.status);return r.json();}
const source=fs.readFileSync('scripts/estate-live-ops.cjs','utf8');
async function command(mode){
 const r=await call(endpoint+'/exec',{method:'POST',body:JSON.stringify({command:['node','-e',source,mode,expected],timeout:55})});
 let report;try{report=JSON.parse(r.stdout.trim());}catch{throw Error('activation_report_unavailable');}
 console.log(JSON.stringify(report));if(r.exit_code!==0||report.ready===false)throw Error(report.error||'activation_step_failed');return report;
}
async function update(flags){
 const m=await call(endpoint);if(!m.instance_id||!m.config)throw Error('machine_configuration_unavailable');
 await call(endpoint,{method:'POST',body:JSON.stringify({current_version:m.instance_id,config:{...m.config,env:{...m.config.env,...flags}}})});
 // Poll after reboot; no blind retry of a configuration mutation.
 for(let i=0;i<30;i++){await pause(5000);try{const r=await fetch('https://burn-city-game.fly.dev/api/deploy-version',{signal:AbortSignal.timeout(5000)}),v=await r.json();if(v.source==='github-volume'&&v.commit===expected){const s=await command('status');if(Object.entries(flags).every(([k,v])=>({ESTATE_SALES_ENABLED:s.sales,ESTATE_ACCOUNTING_ENABLED:s.accounting,ESTATE_LIQUIDITY_ENABLED:s.liquidity,ESTATE_XRP_PROFIT_HARVEST_ENABLED:s.harvest,ESTATE_DISTRIBUTIONS_ENABLED:s.distributions}[k])===(v==='1')))return;}}catch{}}
 throw Error('updated_runtime_flags_not_verified');
}
let changed=false;
try{
 await command('preflight');await command('bootstrap');changed=true;
 await update({ESTATE_ACCOUNTING_ENABLED:'1'});
 let progressed=false;
 for(let i=0;i<60;i++){const s=await command('status');if(s.accounting&&s.checkpoint?.ledger_index>=s.bootstrap?.start_ledger_index&&Date.now()-s.checkpoint.scanned_through_ms<=60000){progressed=true;break;}await pause(5000);}
 if(!progressed)throw Error('accounting_checkpoint_not_progressing');
 await update({ESTATE_SALES_ENABLED:'1',ESTATE_LIQUIDITY_ENABLED:'1',ESTATE_XRP_PROFIT_HARVEST_ENABLED:'1',ESTATE_DISTRIBUTIONS_ENABLED:'1'});
 await command('unpause');
 let previousLedger=null;
 for(let sample=0;sample<4;sample++){
 await pause(20000);const final=await command('status');
 if(final.paused||!final.sales||!final.accounting||!final.liquidity||!final.harvest||!final.distributions||!final.checkpoint||final.liveStatus&&(!final.liveStatus.distributionsEnabled||!final.liveStatus.imgXrpProfitDistributionsEnabled))throw Error('final_live_activation_not_verified');
 if(Date.now()-final.checkpoint.scanned_through_ms>60000)throw Error('final_scanner_not_current');
 if(sample===3&&final.checkpoint.ledger_index<=previousLedger)throw Error('final_scanner_not_advancing');
 previousLedger=final.checkpoint.ledger_index;
 }
 console.log(JSON.stringify({activated:true,commit:expected,mainnetPurchaseOrPayoutProven:false,awaitingOwnerPurchaseApproval:true}));
}catch(e){if(changed){try{await command('pause');}catch{console.error('Activation failed; verify the treasury pause immediately.');}}throw e;}
