'use strict';
// Read-only sizing. No transaction construction, signing or reserve mutation.
const BigNumber=require('bignumber.js');
const D=x=>{if(typeof x!=='string'||!/^\d+(?:\.\d+)?$/.test(x))throw new TypeError('decimal_string_required');return new BigNumber(x);};
function planBalancedEstateDeposit({poolImg,poolRlusd,availableImg,availableRlusd,priceDeviationBps,maxDeviationBps='100',maxShareBps='100'}={}){
 const pi=D(poolImg),pr=D(poolRlusd),ai=D(availableImg),ar=D(availableRlusd),dev=D(priceDeviationBps),limit=D(maxDeviationBps),share=D(maxShareBps);
 if(!pi.gt(0)||!pr.gt(0)||!limit.gte(0)||!share.gt(0)||share.gt(10000))throw new RangeError('invalid_pool_or_guard');
 if(dev.gt(limit))return Object.freeze({ready:false,reason:'img_rlusd_market_price_mismatch',img:'0',rlusd:'0'});
 // Bound each side to maxShareBps of current reserves. Pool ratio is maintained.
 const fraction=BigNumber.minimum(ai.div(pi),ar.div(pr),share.div(10000));
 const amountImg=pi.times(fraction),amountRlusd=pr.times(fraction);
 const safe=x=>x.decimalPlaces(12,BigNumber.ROUND_DOWN).toFixed();
 if(!fraction.gt(0)||!amountImg.gt(0)||!amountRlusd.gt(0))return Object.freeze({ready:false,reason:'no_balanced_inventory',img:'0',rlusd:'0'});
 return Object.freeze({ready:true,reason:null,img:safe(amountImg),rlusd:safe(amountRlusd),poolPriceRlusdPerImg:pr.div(pi).toFixed(12)});
}
module.exports={planBalancedEstateDeposit};
