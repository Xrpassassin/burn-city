'use strict';
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const target='a'.repeat(40),base='https://api.machines.dev/v1/apps/burn-city-game/machines/8d2909be270068';
for(const scenario of ['healthy','failed_status','stale_scanner']){
 const failFinal=scenario==='failed_status',stale=scenario==='stale_scanner';
 const mock=`
 import assert from 'node:assert/strict';
 const base=${JSON.stringify(base)},expected=${JSON.stringify(target)},failFinal=${failFinal},stale=${stale};
 const realTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>realTimeout(fn,1,...args);
 let sampleLedger=100,version=1,env={UNRELATED:'preserved'},paused=true,bootstrap=false;const actions=[];
 process.on('exit',()=>console.log('FIXTURE_RESULT:'+JSON.stringify({actions,env,paused})));
 globalThis.fetch=async(url,options={})=>{
  const ok=v=>new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}});
  if(String(url).endsWith('/api/deploy-version'))return ok({source:'github-volume',commit:expected});
  assert.equal(url===base||url===base+'/exec',true,'only known API URLs');
  if(url===base+'/exec'){
   const body=JSON.parse(options.body),mode=body.command[3];assert.equal(body.command[4],expected);actions.push(mode);
   if(mode==='bootstrap')bootstrap=true;
   if(mode==='unpause'){assert.equal(bootstrap,true);assert.equal(env.ESTATE_DISTRIBUTIONS_ENABLED,'1');paused=false;}
   if(mode==='pause')paused=true;
   const report={mode,commit:expected,accounting:env.ESTATE_ACCOUNTING_ENABLED==='1',sales:env.ESTATE_SALES_ENABLED==='1',liquidity:env.ESTATE_LIQUIDITY_ENABLED==='1',harvest:env.ESTATE_XRP_PROFIT_HARVEST_ENABLED==='1',distributions:env.ESTATE_DISTRIBUTIONS_ENABLED==='1',paused,bootstrap:bootstrap?{start_ledger_index:100}:null,checkpoint:bootstrap?{ledger_index:++sampleLedger,scanned_through_ms:Date.now()-(stale?120000:0)}:null,liveStatus:{distributionsEnabled:!paused&&!failFinal,imgXrpProfitDistributionsEnabled:!paused&&!failFinal}};
   return ok({exit_code:0,stdout:JSON.stringify(report)});
  }
  if(options.method==='POST'){
   const body=JSON.parse(options.body);assert.equal(body.current_version,'v'+version);assert.equal(body.config.env.UNRELATED,'preserved');env=body.config.env;version++;return ok({id:'fixture'});
  }
  return ok({instance_id:'v'+version,config:{image:'fixture-image',env}});
 };
 `;
 const r=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),'scripts/estate-live-operations.mjs'],{encoding:'utf8',timeout:10000,env:{...process.env,ESTATE_EXPECTED_COMMIT:target,FLY_API_TOKEN:'test-fixture-token',CONFIRM_ESTATES_ACTIVATION:'70-30-realized-earnings-only'}});
 assert.equal(r.status,scenario==='healthy'?0:1,r.stderr+'\n'+r.stdout);
 const result=JSON.parse(r.stdout.split('\n').find(x=>x.startsWith('FIXTURE_RESULT:')).slice('FIXTURE_RESULT:'.length));
 assert.equal(result.env.UNRELATED,'preserved');assert.equal(result.actions.indexOf('preflight')<result.actions.indexOf('bootstrap'),true);if(!stale)assert.equal(result.actions.indexOf('bootstrap')<result.actions.indexOf('unpause'),true);
 assert.equal(result.paused,scenario!=='healthy');assert.equal(result.actions.includes('pause'),scenario!=='healthy');assert.equal(result.actions.includes('unpause'),!stale);
 if(scenario==='healthy')assert.equal(r.stdout.includes('"activated":true'),true);
}
console.log('Activation orchestration: expected SHA/version, preserved config, accounting-first order, status verification and failure re-pause passed (no network)');
