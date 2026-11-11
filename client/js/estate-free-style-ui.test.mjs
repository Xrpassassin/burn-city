import assert from 'node:assert/strict';
import {mountEstateFreeStyle} from './estate-free-style-ui.mjs';
import {ESTATE_ARCHITECTURES,ESTATE_PALETTES,estateFreeStyle} from './estate-free-style-options.mjs';
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.parent=null;this.dataset={};this.style={};this.listeners={};this.value='';this.disabled=false;this.text='';}
 append(...nodes){for(const n of nodes)this.appendChild(n);}
 appendChild(node){node.parent=this;this.children.push(node);return node;}
 replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this.text='';this.append(...nodes);}
 set textContent(s){this.replaceChildren();this.text=String(s);}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
 setAttribute(){}
 addEventListener(type,fn){this.listeners[type]=fn;}
 get isConnected(){return this.tag==='root'||!!this.parent?.isConnected;}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
}
globalThis.document={createElement:tag=>new Element(tag)};
const findAll=(node,predicate,out=[])=>{if(predicate(node))out.push(node);for(const c of node.children)findAll(c,predicate,out);return out;};
const flush=()=>new Promise(r=>setImmediate(r));
let token='connected-owner',calls=[],previews=[],savedCalls=[],current={architecture:'classic',palette:'original'};
const storage={getItem:()=>token};
const fetcher=async(url,opts)=>{
 const payload=opts.body&&JSON.parse(opts.body);calls.push({url,method:opts.method,payload});
 if(opts.method==='POST')current={architecture:payload.architecture,palette:payload.palette};
 return {ok:true,json:async()=>({ok:true,style:current,propertyId:'trailer-01',costXrp:0})};
};
const container=new Element('root');
const ui=mountEstateFreeStyle(container,'trailer-01',{storage,fetcher,initialStyle:current,onPreview:s=>previews.push(s),onSaved:(id,s)=>savedCalls.push({id,s})});
await flush();
const selects=findAll(ui.section,x=>x.tag==='select');
const buttons=findAll(ui.section,x=>x.tag==='button');
assert.equal(selects.length,2);
const colorChips=findAll(ui.section,x=>x.tag==='span'&&['Walls','Trim','Roof','Door'].includes(x.title));
assert.equal(colorChips.length,4,'UI shows a coordinated four-material palette, not an arbitrary slider');
assert(colorChips.every(x=>typeof x.style.background==='string'&&x.style.background.startsWith('#')));
assert(ui.section.textContent.includes('limestone'),'default style describes real-world material tones');
assert.equal(Object.keys(ESTATE_ARCHITECTURES).length,3);
assert.equal(Object.keys(ESTATE_PALETTES).length,4);
assert.equal(buttons[2].disabled,false,'owner may save zero-cost finishes');
selects[0].value='modern';selects[1].value='forest';
selects[0].listeners.change();
assert.deepEqual(previews.at(-1),{architecture:'modern',palette:'forest'});
assert(ui.section.textContent.includes('Muted sage'),'style summary updates after selection');
assert.equal(colorChips[0].style.background,'#c0c3ad','wall chip matches selected scene material');
assert.equal(calls.filter(x=>x.method==='POST').length,0,'preview never writes to server or pays');
buttons[2].listeners.click();await flush();
assert.deepEqual(calls.find(x=>x.method==='POST').payload,{propertyId:'trailer-01',architecture:'modern',palette:'forest'});
assert.deepEqual(savedCalls.at(-1),{id:'trailer-01',s:{architecture:'modern',palette:'forest'}});
buttons[1].listeners.click();
assert.equal(previews.at(-1),null,'cancel preview must restore server-backed appearance');
token='switched-wallet';
selects[0].value='rustic';buttons[2].listeners.click();await flush();
assert.equal(savedCalls.length,1,'old owner panel cannot persist a style after wallet change');
ui.dispose();
const guest=new Element('root');token='';
const guestUI=mountEstateFreeStyle(guest,'trailer-01',{storage,fetcher,onPreview:s=>previews.push(s)});
await flush();
assert.equal(findAll(guestUI.section,x=>x.tag==='button')[2].disabled,true,'guest cannot save');
assert(guest.textContent.includes('0 XRP'));
guestUI.dispose();
assert.deepEqual(estateFreeStyle({architecture:'unknown',palette:'invalid'}),{architecture:'classic',palette:'original'});
console.log('Estate free style UI: three designs, four palettes, owner save, free preview and wallet change passed');
