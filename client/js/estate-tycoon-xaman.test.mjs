import assert from 'node:assert/strict';
// Purchase card must route the owner to Xaman (QR on desktop, pre-opened tab + links on
// phones, popup-block fallback) and explain a failed request instead of a dead end.
class Element{
 constructor(tag,connected=false){this.tag=tag;this.connected=connected;this.parent=null;this.children=[];this.style={};this.dataset={};this.disabled=false;this._text='';}
 get isConnected(){return this.connected||!!this.parent?.isConnected;}
 set textContent(v){this.replaceChildren();this._text=String(v);}
 get textContent(){return this._text+this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}
 setAttribute(){}
 append(...xs){for(const x of xs){if(typeof x!=='string')x.parent=this;this.children.push(x);}}
 replaceChildren(...xs){for(const c of this.children)if(c&&typeof c!=='string')c.parent=null;this.children=[];this._text='';this.append(...xs);}
}
globalThis.document={createElement:t=>new Element(t)};
const {mountEstateTycoon}=await import('./estate-tycoon-ui.mjs');
const UUID='1289e9ae-7d5d-4d5f-b89c-18633112ce09',LINK='https://xumm.app/sign/'+UUID;
const catalog=[{id:'porch-lights',name:'Porch & path lights',category:'decor',priceXrp:3,shareUnitsDelta:1,requires:[],eligibleTiers:[]}];
const walk=(root,pred,out=[])=>{if(pred(root))out.push(root);for(const c of root.children||[])if(typeof c!=='string')walk(c,pred,out);return out;};
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
async function scenario({coarse,startReply,openResult}){
 globalThis.matchMedia=()=>({matches:coarse});
 const opened=[];globalThis.open=(...a)=>{opened.push(a);return openResult;};
 const state={propertyId:'trailer-01',tier:'trailer',owned:true,ownerAuthorized:true,purchasesEnabled:true,purchaseStatus:'available',pending:null,
  baseValueDrops:3e6,upgradeValueDrops:0,recordedValueDrops:3e6,recordedShareUnits:1,upgradeShareUnits:0,unlockedItemIds:[],items:catalog};
 const posts=[];
 const fetcher=async(url,opt)=>{
  if(url.includes('/state?'))return {ok:true,status:200,json:async()=>state};
  if(url.includes('/quote?'))return {ok:true,status:200,json:async()=>({ok:true,canPurchase:true,purchasesEnabled:true})};
  posts.push(url);const [status,body]=startReply(url);return {ok:status===200,status,json:async()=>body};
 };
 const c=new Element('div',true);
 mountEstateTycoon(c,'trailer-01',{fetcher,storage:{getItem:()=>'tok'}});await tick();
 const buy=walk(c,x=>x.tag==='button'&&x.textContent==='Buy')[0];assert(buy,'owner sees Buy');
 await buy.onclick();await tick();
 return {c,opened,posts};
}
// Desktop: QR code + https link, no popup.
{const {c,opened}=await scenario({coarse:false,openResult:null,startReply:()=>[200,{ok:true,orderId:'tycoon_'+'a'.repeat(40),deeplink:LINK,qr:LINK+'_q.png'}]});
 assert.equal(opened.length,0);
 const img=walk(c,x=>x.tag==='img')[0];assert(img&&img.src===LINK+'_q.png','desktop shows the Xaman QR');
 assert(walk(c,x=>x.tag==='a'&&x.href===LINK&&x.textContent==='Open in Xaman').length===1);
 assert(c.textContent.includes('Scan the QR code'));}
// Phone: a tab is pre-opened inside the tap and pointed at Xaman; xumm:// fallback offered.
{const win={location:{href:'about:blank'},closed:false,close(){this.closed=true;}};
 const {c,opened}=await scenario({coarse:true,openResult:win,startReply:()=>[200,{ok:true,orderId:'tycoon_'+'a'.repeat(40),deeplink:LINK,qr:LINK+'_q.png'}]});
 assert.equal(opened.length,1);assert.equal(win.location.href,LINK);
 assert(c.textContent.includes('Xaman opened in a new tab'));
 assert(walk(c,x=>x.tag==='a'&&x.href==='xumm://xumm.app/sign/'+UUID).length===1);
 assert.equal(walk(c,x=>x.tag==='img').length,0,'no QR on the phone itself');}
// Phone with popup blocked: visible link still works.
{const {c}=await scenario({coarse:true,openResult:null,startReply:()=>[200,{ok:true,orderId:'tycoon_'+'a'.repeat(40),deeplink:LINK}]});
 assert(c.textContent.includes('Tap Open in Xaman'));assert(walk(c,x=>x.tag==='a'&&x.href===LINK).length===1);}
// Server could not create the request (409): clear message, pre-opened tab closed, no fake link.
{const win={location:{href:'about:blank'},closed:false,close(){this.closed=true;}};
 const {c}=await scenario({coarse:true,openResult:win,startReply:()=>[409,{ok:false,error:'tycoon_order_requires_review',orderId:'tycoon_'+'b'.repeat(40)}]});
 assert(win.closed,'blank tab is closed when no Xaman request exists');
 assert(c.textContent.includes('Xaman could not create this payment request'));
 assert(c.textContent.includes('nothing can be paid or charged'));
 assert.equal(walk(c,x=>x.tag==='a').length,0);}
// Untrusted link hosts are never rendered.
{const {c}=await scenario({coarse:false,openResult:null,startReply:()=>[200,{ok:true,orderId:'tycoon_'+'a'.repeat(40),deeplink:'https://evil.example/sign/'+UUID,qr:'https://evil.example/q.png'}]});
 assert.equal(walk(c,x=>x.tag==='a'||x.tag==='img').length,0);}
console.log('Estates upgrade purchase: Xaman QR, mobile tab/deeplink, popup-block fallback and failed-request messaging passed');
