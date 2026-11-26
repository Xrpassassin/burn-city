'use strict';
// BURN-only recovery after an unverified full refresh; RPC __err must not look like a pin miss.
const assert=require('node:assert/strict');
const {create,BURN_RECOVERY_DELAYS_MS}=require('../server/amm-lock');
const baseline=require('../server/burn-launch-baseline.json');
const {BURN_ISSUER:issuer,BURN_CURRENCY:currency}=require('../server/issuer-return-history');
const data=()=>({nodes:[{name:'BURN',key:issuer+'-'+currency}],pools:[]});
const pin=107955066,hash='A'.repeat(64),anchor={validated:true,ledger_index:pin,ledger_hash:hash};

(async()=>{
  // 1) Swallowed transport errors must surface as the real reason, not a fake pin miss.
  {
    let attempts=0;
    const rpc=async(method)=>{
      attempts++;
      if(method==='server_info') return {error:'slowDown'};
      throw new Error('unexpected '+method);
    };
    const svc=create({rpc,gap:0});
    await svc.refresh(data);
    const t=svc.snapshot().tokens.BURN;
    assert.equal(t.status,'unverified');
    assert.equal(t.supply_reconciliation.reason,'slowDown');
    assert.notEqual(t.supply_reconciliation.reason,'gateway balances are not pinned to the validated issuer snapshot');
    assert.equal(attempts,3,'bounded retries still apply for transport errors');
  }

  // 2) After a failed refresh, BURN-only recovery runs on the scheduled delays and can verify.
  {
    let attempts=0;
    const timers=[];
    const rpc=async(method,params)=>{
      if(method==='server_info'){
        attempts++;
        return {info:{network_id:0,validated_ledger:{seq:pin,hash}}};
      }
      assert.equal(params.ledger_hash,hash);
      if(method==='account_info')return {...(baseline.locked.result||baseline.locked),...anchor};
      if(method==='gateway_balances'){
        // Fail during the initial refresh (attempts 1-3), succeed on recovery (attempts >=4).
        return {...anchor,validated:attempts>=4,account:issuer,obligations:{[currency]:'34843983811577.57'}};
      }
      assert.equal(method,'account_objects');
      return {...anchor,account:issuer,account_objects:[]};
    };
    const svc=create({rpc,gap:0,setTimeout:(fn,ms)=>{ timers.push({fn,ms}); return {unref(){}}; }});
    await svc.refresh(data);
    assert.equal(svc.snapshot().tokens.BURN.status,'unverified');
    assert.deepEqual(timers.map(t=>t.ms),BURN_RECOVERY_DELAYS_MS);
    await timers[0].fn();
    assert.equal(svc.snapshot().tokens.BURN.status,'verified');
    assert.equal(svc.snapshot().tokens.BURN.supply_reconciliation.burned_pct,96.5156);
  }

  console.log('BURN recovery preserves fail-closed rules and surfaces real RPC errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
