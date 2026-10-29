'use strict';
// Preserve the exact on-chain decimal. Accounting remains in existing micro-IMG
// units; fractions below one unit are retained as dust and never rounded up.
function splitImgAmount(value) {
 if(typeof value!=='string'||value.length>256)throw new Error('invalid_delivered_img');
 const m=/^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(value);
 if(!m)throw new Error('invalid_delivered_img');
 const digits=m[1]+(m[2]||''),point=m[1].length+Number(m[3]||0);
 if(point>97||point< -96||digits.length>194)throw new Error('invalid_delivered_img');
 const expanded=point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);
 let [whole,fraction='']=expanded.split('.');
 whole=whole.replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
 if(!/[1-9]/.test(whole+fraction))throw new Error('zero_img_delivery');
 const exact=whole+(fraction?'.'+fraction:'');
 const units=BigInt(whole)*1000000n+BigInt(fraction.slice(0,6).padEnd(6,'0'));
 const tail=fraction.slice(6).replace(/0+$/,'');
 return Object.freeze({exact,units:String(units),dust:tail?'0.'+'0'.repeat(6)+tail:'0'});
}
module.exports={splitImgAmount};
