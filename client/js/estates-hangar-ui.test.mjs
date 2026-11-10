import assert from 'node:assert/strict';
import {mountEstateHangarLogbook} from './estates-hangar-ui.mjs';

// Minimal DOM harness: test real owner UI state changes without loading a browser.
// No personal history must be presented after a token change while a GET is pending.
class Element {
 constructor(tag,connected=false){
  this.tag=tag;this._connected=connected;this._text='';this.children=[];
  this.parent=null;this.dataset={};this.style={};this.attributes={};this.value='';
 }
 get isConnected(){return this._connected||Boolean(this.parent?.isConnected);}
 set textContent(s){this.replaceChildren();this._text=String(s);}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
 setAttribute(k,v){this.attributes[k]=v;}
 appendChild(child){if(child.parent)child.parent.replaceChildren(...child.parent.children.filter(c=>c!==child));
  child.parent=this;this.children.push(child);return child;}
 append(...children){for(const child of children)this.appendChild(child);}
 replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this._text='';this.append(...children);}
}
const listeners=new Map();
globalThis.document={createElement:tag=>new Element(tag)};
globalThis.window={
 addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
 removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)
};
const notify=name=>{for(const fn of [...listeners.get(name)||[]])fn();};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const storage={getItem:()=>token};
let token='wallet-A',release,requestedAuth='';
const container=new Element('div',true);
const fetcher=async(_,options)=>{requestedAuth=options.headers.authorization;return new Promise(r=>{release=r;});};
const stale=mountEstateHangarLogbook(container,'mansion-01',{fetcher,storage});
assert.equal(requestedAuth,'Bearer wallet-A');
token='wallet-B';
notify('focus');
release({ok:true,json:async()=>({
 ok:true,propertyId:'mansion-01',style:{paint:'royal',trim:'copper',callsign:'PRIVATE DRAGON'},
 choices:{paints:['royal'],trims:['copper']},totals:{completedFlights:1,flightSeconds:100,stopIds:[]},
 milestones:{firstLanding:false,frequentPilot:false,allLookouts:false,oneFlightCircuit:false},
 flights:[{endedAt:1000,durationSeconds:100,routeVisited:[]}]
})});
await flush();
assert(!container.textContent.includes('PRIVATE DRAGON'),'cross-wallet history must never render after an asynchronous request');
assert(container.textContent.includes('Wallet changed'),'private records are replaced by a re-authentication notice');
assert.equal(listeners.get('focus')?.size||0,0,'session listener is removed after invalidation');
assert.equal(listeners.get('storage')?.size||0,0,'storage listener is removed after invalidation');
stale.dispose();

// A fresh authenticated owner session may load the hangar, then dispose cleanly.
const container2=new Element('div',true);
const fresh=mountEstateHangarLogbook(container2,'mansion-01',{fetcher:async()=>({
 ok:true,json:async()=>({
 ok:true,propertyId:'mansion-01',style:{paint:'obsidian',trim:'brass',callsign:'BURN AIR'},
 choices:{paints:['obsidian'],trims:['brass']},totals:{completedFlights:0,flightSeconds:0,stopIds:[]},
 milestones:{firstLanding:false,frequentPilot:false,allLookouts:false,oneFlightCircuit:false},flights:[]
 })
}),storage});
await flush();
assert(container2.textContent.includes('BURN AIR'),'new owner session may render current private hangar');
fresh.dispose();
assert.equal(listeners.get('focus')?.size||0,0,'explicit UI disposal removes listeners');
assert.equal(listeners.get('storage')?.size||0,0,'explicit UI disposal removes storage listener');

console.log('Estates Hangar UI: wallet-change privacy, stale fetch suppression, new session and cleanup passed');
