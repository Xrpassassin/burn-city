const H=require('../server/hate.js');let f=0,ok=0;
const bad=[Buffer.from('bmlnZ2Vy','base64')+'',Buffer.from('TjFHR0E=','base64')+'',Buffer.from('biBpIGcgZyBh','base64')+'',Buffer.from('bmlpaWlnZ2dnYWE=','base64')+'',Buffer.from('a2lrZXM=','base64')+'','you '+Buffer.from('ZjRnZ290','base64')+'!',Buffer.from('bmkuZy5nLmVy','base64')+'','nіgga'];
const good=['Scunthorpe united','I love Niger and Nigeria','snigger','niggardly spending','raccoon','spick and span','cocoon','pakistan is big','Ive got a cigarette','gookie','skiker','spice','fagus tree','con artist','go on','hello world','burn city rocks','glass','analysis'];
bad.forEach((s,i)=>H.hit(s)?ok++:(f++,console.log('MISS bad#'+i)));good.forEach(s=>!H.hit(s)?ok++:(f++,console.log('FP',s)));console.log(ok,'ok',f,'fail');
const k='rTESTacct'+Date.now();H.report(k,'x');H.report(k,'x');const m1=H.muted(k);H.report(k,'x');const m2=H.muted(k);const r=H.reports(5);
console.log(!m1&&m2&&r[0].acct_mask.includes('…')&&!('kh' in r[0])?'strike ok':'STRIKE FAIL');
