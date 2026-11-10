import assert from 'node:assert/strict';
import {mountEstateTycoon} from './estate-tycoon-ui.mjs';
// Zero-dependency DOM harness: public unauthenticated shoppers may inspect
// local 3D upgrade outlines, but neither payment nor ownership is changed.
class Element{
 constructor(tag,connected=false){this.tag=tag;this.connected=connected;this.parent=null;this.children=[];
  this.style={};this.dataset={};this.disabled=false;this._text='';}
 get isConnected(){return this.connected||!!this.parent?.isConnected;}
 set textContent(value){this.replaceChildren();this._text=String(value);}
 get textContent(){return this._text+this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}
 setAttribute(){}
 append(...xs){for(const x of xs){if(typeof x!=='string')x.parent=this;this.children.push(x);}}
 replaceChildren(...xs){for(const ch of this.children)if(ch&&typeof ch!=='string')ch.parent=null;
  this.children=[];this._text='';this.append(...xs);}
}
const document={createElement:tag=>new Element(tag)};
globalThis.document=document;
const container=new Element('div',true);
const calls=[],requests=[];
const catalog=[
 {id:'cozy-awning',name:'Covered porch awning',category:'exterior',priceXrp:6,shareUnitsDelta:2,requires:[],eligibleTiers:[]},
 {id:'estate-helicopter',name:'Estate helicopter & private helipad',category:'aviation',priceXrp:60,shareUnitsDelta:20,requires:[],eligibleTiers:['family','mansion']}
];
const property={propertyId:'starter-01',tier:'starter',owned:false,
 baseValueDrops:75000000,upgradeValueDrops:0,recordedValueDrops:75000000,recordedShareUnits:25,
 unlockedItemIds:[]};
const fetcher=async url=>{
 requests.push(url);return {ok:true,json:async()=>({properties:[property],catalog})};
};
mountEstateTycoon(container,'starter-01',{fetcher,storage:{getItem:()=>null},onPreview:id=>{
 calls.push(id);return true;
}});
for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));
const buttons=()=>{const result=[];const walk=x=>{if(x?.tag==='button')result.push(x);for(const c of x?.children||[])if(typeof c!=='string')walk(c);};walk(container);return result;};
let preview=buttons().find(b=>b.textContent==='View on property');
assert(preview,'nonowner sees a 3D preview action for eligible unpurchased exterior improvement');
assert(!buttons().some(b=>b.textContent==='Buy'),'XRP purchases remain disabled');
await preview.onclick();
assert.deepEqual(calls,['cozy-awning']);
assert(container.textContent.includes('CYAN 3D PREVIEW ONLY'),'UI must explicitly disclaim that this is not an installed upgrade');
assert.equal(property.unlockedItemIds.length,0,'preview cannot mutate official ownership state');
assert.equal(requests.length,1,'preview does not send a payment or upgrade API request');
const hide=buttons().find(b=>b.textContent==='Hide preview');
assert(hide,'a currently shown visual preview is dismissible');
await hide.onclick();
assert.deepEqual(calls,['cozy-awning',null]);
assert(!container.textContent.includes('CYAN 3D PREVIEW ONLY'),'dismissal restores normal shop messaging');
assert(!buttons().some(b=>b.textContent==='Buy'));
assert(!buttons().some(b=>b.textContent==='View on property'&&b.parent?.textContent.includes('helicopter')),
 'tier-restricted aviation cannot be previewed as an owned house fixture');
console.log('Estates shop: visual-only preview, clear action and zero purchase/ownership side effects passed');
