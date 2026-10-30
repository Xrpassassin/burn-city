import assert from 'node:assert/strict';
import {rewardScenario,formatRewardUnits,sharePercent} from './estate-reward-scenario.mjs';
const calc=netEarnings=>rewardScenario({netEarnings,shareUnits:1,totalShareUnits:3});
assert.equal(calc('1').amount,'0.333333');assert.equal(calc('0').amount,'0.000000');assert.equal(calc('-123.5').amount,'0.000000');
assert.equal(rewardScenario({netEarnings:'999999999999.999999',shareUnits:3,totalShareUnits:3}).amount,'999999999999.999999');
assert.equal(sharePercent(6,31),'19.3548');assert.equal(sharePercent(0,0),'0.0000');assert.equal(formatRewardUnits('12'),'0.000012');
for(const v of ['NaN','Infinity','1e3','1.0000001','1000000000000','<script>',''])assert.throws(()=>calc(v));
assert.throws(()=>rewardScenario({netEarnings:'1',shareUnits:4,totalShareUnits:3}));assert.throws(()=>sharePercent(.5,3));
assert.equal(calc('1').hypothetical,true);console.log('Reward scenarios: exact decimal math, zero/loss inputs, safe weights, precision bounds and no forecast defaults passed');
