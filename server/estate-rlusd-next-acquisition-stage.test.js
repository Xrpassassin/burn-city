'use strict';
const assert=require('node:assert/strict');
const {planEstateNextAcquisitionStage:plan}=require('./estate-rlusd-next-acquisition-stage');
const first=plan({
 plannedBudgetDrops:'148500000',poolXrpReserveDrops:'1000000000',
 maxImpactBps:100
});
assert.equal(first.currentMarketImpactCeilingDrops,'10101010');
assert.equal(first.nextStageSendMaxDrops,'10101010');
assert.equal(first.isFinalPlannedStage,false);
assert.equal(first.ready,true);
assert.equal(first.activeFinancialTransactionsAuthorized,false);
let committed=0n;
for(let n=0;n<100;n++){
 const row=plan({plannedBudgetDrops:'148500000',
   committedBudgetDrops:committed.toString(),
   poolXrpReserveDrops:'1000000000',completedStages:n});
 if(!row.ready){assert.equal(row.blocker,null);break;}
 const spend=BigInt(row.nextStageSendMaxDrops);
 assert(spend>0n&&spend<=10101010n);
 committed+=spend;
 assert.equal(row.nextStageCommittedTotalDrops,committed.toString());
}
assert.equal(committed,148500000n);
const done=plan({plannedBudgetDrops:'148500000',
 committedBudgetDrops:'148500000',poolXrpReserveDrops:'1000000000',completedStages:20});
assert.equal(done.ready,false);
assert.equal(done.nextStageSendMaxDrops,'0');
const limit=plan({plannedBudgetDrops:'100',
 committedBudgetDrops:'0',poolXrpReserveDrops:'9999999',
 completedStages:2,maxStages:2});
assert.equal(limit.ready,false);
assert.equal(limit.blocker,'acquisition_stage_limit_review_required');
assert.equal(limit.nextStageSendMaxDrops,'0');
const depth=plan({plannedBudgetDrops:'100',
 poolXrpReserveDrops:'0'});
assert.equal(depth.ready,false);
assert.equal(depth.blocker,'acquisition_pool_depth_below_one_drop');
const tiny=plan({plannedBudgetDrops:'1',
 poolXrpReserveDrops:'1000000000'});
assert.equal(tiny.nextStageSendMaxDrops,'1');
assert.equal(tiny.isFinalPlannedStage,true);
assert.throws(()=>plan({plannedBudgetDrops:'99',committedBudgetDrops:'100',poolXrpReserveDrops:'1'}),/acquisition_budget_overcommitted/);
for(const bad of ['-1','1.1','01',100,null,undefined]){
 assert.throws(()=>plan({plannedBudgetDrops:bad,poolXrpReserveDrops:'2000'}),/planned_budget_integer_drops_required/);
}
assert.throws(()=>plan({plannedBudgetDrops:'100',poolXrpReserveDrops:'2000',maxImpactBps:1001}),/invalid_acquisition_impact_limit/);
assert.throws(()=>plan({plannedBudgetDrops:'100',poolXrpReserveDrops:'2000',completedStages:513}),/invalid_acquisition_stage_limit/);
console.log('Staged IMG/RLUSD acquisitions: bounded price-impact budget, 100% capital conservation, restart-compatible stage index, blocked tiny depth and maximum stages passed');
