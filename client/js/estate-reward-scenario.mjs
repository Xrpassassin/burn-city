// Allocation math only. No market data, APY, projected yield, signing or API calls.
const SCALE=1000000n;
export function formatRewardUnits(units){
 const n=BigInt(units);if(n<0n)throw Error('Amounts must be nonnegative.');
 return (n/SCALE)+'.'+String(n%SCALE).padStart(6,'0');
}
export function sharePercent(weight,total){
 if(!Number.isSafeInteger(weight)||!Number.isSafeInteger(total)||weight<0||total<0||weight>total)throw Error('Invalid allocation weights.');
 if(!total)return '0.0000';
 const n=BigInt(weight)*1000000n/BigInt(total);return (n/10000n)+'.'+String(n%10000n).padStart(4,'0');
}
export function rewardScenario({netEarnings,shareUnits,totalShareUnits}){
 if(typeof netEarnings!=='string'||! /^-?\d{1,12}(?:\.\d{1,6})?$/.test(netEarnings))throw Error('Enter an amount with at most six decimal places.');
 sharePercent(shareUnits,totalShareUnits);
 const negative=netEarnings.startsWith('-'),[whole,fraction='']=netEarnings.replace(/^-/,'').split('.');
 const net=negative?0n:BigInt(whole)*SCALE+BigInt(fraction.padEnd(6,'0'));
 const allocation=totalShareUnits?net*BigInt(shareUnits)/BigInt(totalShareUnits):0n;
 return {amount:formatRewardUnits(allocation),sharePercent:sharePercent(shareUnits,totalShareUnits),netAmount:formatRewardUnits(net),hypothetical:true};
}
