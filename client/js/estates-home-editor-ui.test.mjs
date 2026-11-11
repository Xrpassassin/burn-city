import assert from 'node:assert/strict';
import {mountEstateHomeEditor} from './estates-home-editor-ui.mjs';
class Element{
 constructor(tag){this.tag=tag;this.tagName=tag.toUpperCase();this.children=[];this.parent=null;this.dataset={};this.style={};this.listeners={};this.value='';this.disabled=false;this.text='';this.width=360;this.height=300;}
 append(...items){for(const x of items)this.appendChild(x);}
 appendChild(x){x.parent=this;this.children.push(x);return x;}
 replaceChildren(...items){for(const x of this.children)x.parent=null;this.children=[];this.text='';this.append(...items);}
 set textContent(value){this.replaceChildren();this.text=String(value);}
 get textContent(){return this.text+this.children.map(x=>x.textContent).join('');}
 setAttribute(name,val){this[name]=String(val);}
 addEventListener(type,fn){this.listeners[type]=fn;}
 get isConnected(){return this.tag==='root'||!!this.parent?.isConnected;}
 getContext(){return null;}
 getBoundingClientRect(){return {left:0,top:0,width:360,height:300};}
 click(){if(!this.disabled)this.listeners.click?.({clientX:0,clientY:0,target:this});}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
}
globalThis.document={createElement:tag=>new Element(tag)};
const all=(node,predicate,acc=[])=>{if(predicate(node))acc.push(node);for(const child of node.children)all(child,predicate,acc);return acc;};
const button=(root,label)=>all(root,x=>x.tag==='button').find(x=>x.textContent.includes(label));
const initial={ok:true,propertyId:'trailer-01',tier:'trailer',role:'owner',editable:true,layoutId:'cozy',
 layouts:[{id:'cozy',name:'Cozy Home',unlocked:true,priceXrp:0},{id:'open',name:'Open Living',unlocked:true,priceXrp:0},{id:'arcade-suite',name:'Arcade Suite',unlocked:false,priceXrp:9}],
 catalog:[{id:'chair',label:'Accent Chair'},{id:'plant',label:'Plant'}],
 furniture:[{id:'seat-1',type:'chair',x:-.5,z:-.5,rotation:0}],
 dimensions:{halfX:2.6,halfZ:2.1}};
let token='owner-token',requests=[],previews=[],saved=[],exits=0;
const storage={getItem:()=>token};
const fetcher=async(url,opts)=>{
 requests.push({url,opts});
 const state=JSON.parse(opts.body);
 return {ok:true,json:async()=>({...initial,...state,ok:true,costXrp:0})};
};
const host=new Element('root');
const editor=mountEstateHomeEditor(host,initial,{storage,fetcher,onPreview:s=>previews.push(s),onSaved:s=>saved.push(s),onExit:()=>exits++});
const selects=all(editor.root,x=>x.tag==='select');
const canvas=all(editor.root,x=>x.tag==='canvas')[0];
assert.equal(selects.length,2);
assert.equal(canvas.role,'grid');
assert.equal(canvas.tabindex,'0');
assert(canvas.style.cssText.includes('width:100%'),'floor plan fits phones and tablets');
assert(canvas.style.cssText.includes('touch-action:manipulation'),'touch drag/scroll must not zoom page');
assert(all(editor.root,x=>x.tag==='button').every(x=>x.style.cssText.includes('min-height:48px')||x.style.cssText.includes('min-height:52px')));
assert.equal(button(editor.root,'Save design · 0 XRP').disabled,false);
const chair=button(editor.root,'Accent Chair');
chair.click();
assert.equal(chair['aria-pressed'],'false','old selected chip is replaced on re-render');
assert(button(editor.root,'Accent Chair')['aria-pressed']==='true','selection is explicit and accessible');
button(editor.root,'→').click();
assert.equal(previews.at(-1).furniture[0].x,0,'touch arrow nudges by half a meter');
let stopped=0,prevented=0;
editor.root.listeners.keydown({key:'ArrowDown',target:canvas,stopPropagation(){stopped++},preventDefault(){prevented++}});
assert.equal(previews.at(-1).furniture[0].z,0,'desktop keyboard arrows nudge the same model');
editor.root.listeners.keydown({key:'r',target:canvas,stopPropagation(){stopped++},preventDefault(){prevented++}});
assert.equal(previews.at(-1).furniture[0].rotation,90);
editor.root.listeners.keydown({key:'z',ctrlKey:true,target:canvas,stopPropagation(){stopped++},preventDefault(){prevented++}});
assert.equal(previews.at(-1).furniture[0].rotation,0,'undo applies to keyboard changes');
assert(stopped===3&&prevented===3,'keyboard shortcuts never leak into game character controls');
const layout=selects[0];layout.value='arcade-suite';layout.listeners.change();
assert.equal(editor.current.layoutId,'cozy','locked XRP layout cannot be selected by editing browser fields');
layout.value='open';layout.listeners.change();
assert.equal(previews.at(-1).layoutId,'open');
assert.equal(requests.length,0,'preview does not submit payments or writes');
button(editor.root,'Save design · 0 XRP').click();
await new Promise(r=>setImmediate(r));
assert.equal(requests.length,1,'one explicit save only');
assert(requests[0].url.endsWith('/api/estates/home/state'));
assert.equal(requests[0].opts.method,'POST');
assert.equal(JSON.parse(requests[0].opts.body).layoutId,'open');
assert.equal(saved.length,1);
token='switched-wallet';
button(editor.root,'Save design · 0 XRP').click();
await new Promise(r=>setImmediate(r));
assert.equal(requests.length,1,'wallet switch blocks further owner writes');
editor.dispose();
const guestHost=new Element('root');token='';
const guest=mountEstateHomeEditor(guestHost,{...initial,role:'guest',editable:false},{storage,fetcher});
assert(button(guest.root,'Save design · 0 XRP').disabled);
assert(button(guest.root,'↑').disabled);
assert(guest.root.textContent.includes('invited guests'));
guest.dispose();
console.log('Estate cross-platform furnishing editor: responsive touch targets, visible selection, D-pad, keyboard, undo, ownership and save controls passed');
