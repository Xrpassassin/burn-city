import assert from 'node:assert/strict';
import {estateHouseParts} from './estates-house-design.mjs';
import {ESTATE_ARCHITECTURES,ESTATE_ARCHITECTURE_NOTES,ESTATE_PALETTES,estatePaletteColor,estatePalettePreview} from './estate-free-style-options.mjs';
const fixtures=[['trailer',6,5,3],['apartment',7,8,10],['starter',8,7,5],['family',10,9,6],['mansion',13,11,8]];
const rgb=hex=>[16,8,0].map(shift=>(hex>>>shift)&255);
const luminance=hex=>rgb(hex).map(n=>n/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((acc,v,i)=>acc+v*[.2126,.7152,.0722][i],0);
const saturation=hex=>{const x=rgb(hex),max=Math.max(...x);return max?(max-Math.min(...x))/max:0;};
assert.equal(Object.keys(ESTATE_ARCHITECTURES).length,3);
assert.equal(Object.keys(ESTATE_PALETTES).length,4);
for(const [name,def] of Object.entries(ESTATE_PALETTES)){
 assert(def.label&&def.description&&def.description.length>35,name+' has human-facing architectural color rationale');
 const {plaster,trim,roof,door,stone,timber}=def.colors;
 assert([plaster,trim,roof,door,stone,timber].every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffff),name+' valid colors');
 assert(luminance(trim)-luminance(plaster)>.065,name+' trim should be discernibly lighter than wall paint');
 assert(luminance(roof)<luminance(plaster)*.48,name+' roof must remain visibly darker than the walls');
 assert(luminance(door)<luminance(plaster)*.8,name+' door accent must remain grounded, not fluorescent');
 assert([plaster,trim,roof].every(v=>saturation(v)<.3),name+' field, trim and roof stay low-saturation');
 assert.deepEqual(estatePalettePreview(name),[plaster,trim,roof,door]);
 assert.equal(estatePaletteColor('trim',name,0),trim);
 assert(estatePaletteColor('leaf',name,0x456745)===0x456745,'landscape greenery is natural rather than repainted');
}
for(const architecture of Object.keys(ESTATE_ARCHITECTURES)){
 assert(ESTATE_ARCHITECTURE_NOTES[architecture]?.length>25);
}
for(const [tier,w,d,h] of fixtures){
 const item={id:'test-'+tier,propertyId:'test-'+tier,tier,buildingFootprint:{width:w,depth:d,height:h}};
 for(const architecture of Object.keys(ESTATE_ARCHITECTURES)){
  const parts=estateHouseParts({...item,architecture,palette:'forest'});
  assert(parts.some(p=>p.name.startsWith(architecture+'-')),tier+' '+architecture+' creates actual structure');
  assert(parts.find(p=>p.name==='entry-door')?.mat==='door',tier+' has an intentional wood/paint front door');
  assert(parts.some(p=>p.name.includes('surround')&&p.mat==='trim'),tier+' has contrasting window surrounds');
  assert(parts.some(p=>p.name==='planter'&&p.shape==='cylinder'),tier+' planters must be rounded');
  assert(parts.some(p=>p.name==='planter-soil'&&p.shape==='cylinder'),tier+' planters have believable soil');
  for(const p of parts){
   const halfX=(Math.abs(Math.cos(p.rz))*p.width+Math.abs(Math.sin(p.rz))*p.height)/2;
   assert(Math.abs(p.x)+halfX<=w/2+.001,tier+' '+architecture+' '+p.name+' exceeds collision width');
   assert(Math.abs(p.z)+p.depth/2<=d/2+.001,tier+' '+architecture+' '+p.name+' exceeds collision depth');
  }
  for(const palette of Object.keys(ESTATE_PALETTES)){
   assert(estatePalettePreview(palette).length===4);
   assert(estatePaletteColor('door',palette,0)!==0);
  }
 }
}
console.log('Estate free visual art QA: cohesive neutral palettes, door/trim/roof hierarchy, rounded details and tier bounds passed');
