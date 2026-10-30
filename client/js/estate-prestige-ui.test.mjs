import assert from 'node:assert/strict';
import {mountEstatePrestige} from './estate-prestige-ui.mjs';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.parent=null;this.text='';}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.append(...nodes);}
 set textContent(s){this.text=s;this.replaceChildren();}get textContent(){return this.text+this.children.map(n=>n.textContent).join(' ');}
 get isConnected(){return this.tag==='root'||!!this.parent?.isConnected;}
}
globalThis.document={createElement:tag=>new Element(tag)};
const walk=(root,fn)=>{if(fn(root))return root;for(const c of root.children){const n=walk(c,fn);if(n)return n;}return null;};
const flush=()=>new Promise(r=>setTimeout(r,0));
let state={ok:true,owned:true,propertyId:'trailer-01',level:0,label:'Homestead',totalSpentDrops:3000000,shareUnits:1,canUpgrade:true,upgradesEnabled:false,next:{level:1,label:'Garden',remainingDrops:12000000,features:['Flower boxes']}},calls=[],previews=[],confirmed=0,pending=0,guest=false;
const storage={getItem:()=>guest?null:'test-session'};
const fetcher=async(url,opts={})=>{calls.push({url,body:opts.body&&JSON.parse(opts.body),method:opts.method});let data=state;
 if(url.endsWith('/appearance'))data={properties:[{...state,purchaseAppearance:{level:1,label:'Garden',features:['Flower boxes']}}]};
 if(url.endsWith('/start'))data={ok:true,upgradeId:'bound-server-id',deeplink:'https://example.com/sign'};
 if(url.endsWith('/confirm'))data=++pending===1?{ok:false,pending:true}:{ok:true,appearance:{level:1}};
 return {ok:true,status:200,json:async()=>data};};
const root=new Element('root');
let section=mountEstatePrestige(root,'trailer-01',{api:'https://example.com',fetcher,storage,onPreview:level=>previews.push(level),onConfirmed:()=>confirmed++});await flush();
const button=text=>walk(section,n=>n.tag==='button'&&n.textContent===text);
assert(section.textContent.includes('12 XRP'));assert(!button('Review upgrade in Xaman'),'disabled upgrades cannot initiate payments');
const count=calls.length;await button('Preview Garden').onclick();assert.deepEqual(previews,[1]);assert.equal(calls.length,count,'preview makes no payment request');assert(section.textContent.includes('PREVIEW ONLY'));
await button('Show current property').onclick();assert.equal(previews.at(-1),null);
state={...state,upgradesEnabled:true};root.replaceChildren();section=mountEstatePrestige(root,'trailer-01',{api:'https://example.com',fetcher,storage,onConfirmed:()=>confirmed++});await flush();
await button('Review upgrade in Xaman').onclick();assert.deepEqual(calls.find(c=>c.url.endsWith('/start')).body,{propertyId:'trailer-01'},'client sends neither amount nor target stage');
assert(walk(section,n=>n.tag==='a'&&n.href==='https://example.com/sign'));
await button('Check upgrade payment').onclick();assert.equal(confirmed,0,'pending signature cannot upgrade the displayed property');
await button('Check upgrade payment').onclick();assert.equal(confirmed,1);assert.deepEqual(calls.find(c=>c.url.endsWith('/confirm')).body,{upgradeId:'bound-server-id'});
guest=true;state={...state,owned:false};root.replaceChildren();section=mountEstatePrestige(root,'trailer-01',{api:'https://example.com',fetcher,storage,onPreview:level=>previews.push(level)});await flush();
assert(button('Preview purchase appearance'),'guests can preview a purchase without signing in');await button('Preview purchase appearance').onclick();assert.equal(previews.at(-1),1);assert(!button('Review upgrade in Xaman'));
console.log('Estate upgrade UI: exact quotes, free/reversible previews, disabled payments, bound session confirmation and guest purchase previews passed');
